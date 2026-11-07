<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ColorScale } from './colorScale'
import { cellPosition, dieAt, layout, notchAngle, type Die, type GridExtent } from './geometry'

/**
 * One wafer drawn on a Canvas 2D context (docs/components.md#wafer-map): a cell per die,
 * the fitted outline with a notch, optional grid lines. Hover is a grid lookup, not a
 * per-shape hit test, so it stays cheap with tens of thousands of dies.
 */
const props = defineProps<{
  dies: Die[]
  extent: GridExtent
  scale: ColorScale
  flipX: boolean
  flipY: boolean
  notch: 'down' | 'up' | 'left' | 'right'
  showGrid: boolean
  showOutline: boolean
  outlineColor: string
  gridColor: string
}>()

const emit = defineEmits<{ hover: [die: Die | null, event: MouseEvent]; drawn: [] }>()

const host = ref<HTMLDivElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const size = ref({ w: 0, h: 0 })

const lookup = computed(() => new Map(props.dies.map((d) => [`${d.x},${d.y}`, d])))
const geometry = computed(() => layout(props.extent, size.value.w, size.value.h))

function draw(): void {
  const el = canvas.value
  const { w, h } = size.value
  if (!el || !w || !h) return
  const dpr = window.devicePixelRatio || 1
  el.width = Math.round(w * dpr)
  el.height = Math.round(h * dpr)
  const ctx = el.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  const l = geometry.value
  // Dies: fill each cell; a hairline gap separates neighbors when cells are big enough.
  const gap = l.cell >= 6 ? 0.5 : 0
  for (const die of props.dies) {
    const { left, top } = cellPosition(die, props.extent, l, props.flipX, props.flipY)
    ctx.fillStyle = props.scale.color(die.value)
    ctx.fillRect(left + gap, top + gap, l.cell - 2 * gap, l.cell - 2 * gap)
  }

  if (props.showGrid && l.cell >= 4) {
    ctx.strokeStyle = props.gridColor
    ctx.lineWidth = 0.5
    for (const die of props.dies) {
      const { left, top } = cellPosition(die, props.extent, l, props.flipX, props.flipY)
      ctx.strokeRect(left, top, l.cell, l.cell)
    }
  }

  if (props.showOutline) {
    const angle = notchAngle(props.notch)
    const notchHalf = 0.06
    ctx.strokeStyle = props.outlineColor
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(l.cx, l.cy, l.radius, angle + notchHalf, angle - notchHalf + Math.PI * 2)
    // The notch: a small V into the wafer.
    const depth = Math.max(4, l.radius * 0.05)
    const nx = l.cx + Math.cos(angle) * (l.radius - depth)
    const ny = l.cy + Math.sin(angle) * (l.radius - depth)
    ctx.lineTo(nx, ny)
    ctx.closePath()
    ctx.stroke()
  }
  emit('drawn')
}

let observer: ResizeObserver | undefined
let frame = 0

function scheduleDraw(): void {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(draw)
}

onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    if (!entry) return
    size.value = { w: entry.contentRect.width, h: entry.contentRect.height }
  })
  if (host.value) observer.observe(host.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  cancelAnimationFrame(frame)
})

watch(
  () => [
    props.dies,
    props.extent,
    props.scale,
    props.flipX,
    props.flipY,
    props.notch,
    props.showGrid,
    props.showOutline,
    props.outlineColor,
    size.value,
  ],
  scheduleDraw,
  { deep: false },
)

function onMove(event: MouseEvent): void {
  const rect = canvas.value?.getBoundingClientRect()
  if (!rect) return
  const die = dieAt(
    event.clientX - rect.left,
    event.clientY - rect.top,
    props.extent,
    geometry.value,
    props.flipX,
    props.flipY,
    lookup.value,
  )
  emit('hover', die ?? null, event)
}

defineExpose({
  /** PNG of the current drawing (for the zoomed-out preview). */
  toDataUrl: () => canvas.value?.toDataURL('image/png'),
})
</script>

<template>
  <div ref="host" class="wafer-canvas">
    <canvas
      ref="canvas"
      class="wafer-canvas__canvas"
      :style="{ width: `${size.w}px`, height: `${size.h}px` }"
      @mousemove="onMove"
      @mouseleave="(e) => emit('hover', null, e)"
    />
  </div>
</template>

<style scoped>
.wafer-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.wafer-canvas__canvas {
  position: absolute;
  inset: 0;
  display: block;
}
</style>
