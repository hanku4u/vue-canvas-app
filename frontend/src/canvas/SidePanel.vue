<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NButton, NIcon, NTooltip } from 'naive-ui'
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from '@lucide/vue'

/**
 * A collapsible, resizable editor side panel. Drag (or focus and use the arrow keys on) the
 * inner edge to resize; double-click it to reset. State is remembered per browser.
 */
const props = defineProps<{
  side: 'left' | 'right'
  title: string
  storageKey: string
  width?: number
}>()

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(props.storageKey) === 'collapsed'
  } catch {
    return false
  }
}

const collapsed = ref(readCollapsed())

const MIN_WIDTH = 200
const maxWidth = () => Math.max(MIN_WIDTH, Math.round(window.innerWidth * 0.5))
const clampWidth = (w: number) => Math.round(Math.min(maxWidth(), Math.max(MIN_WIDTH, w)))
const widthKey = `${props.storageKey}.width`

function readWidth(): number {
  try {
    const saved = Number(localStorage.getItem(widthKey))
    return saved ? clampWidth(saved) : (props.width ?? 240)
  } catch {
    return props.width ?? 240
  }
}

const currentWidth = ref(readWidth())
const resizing = ref(false)

function saveWidth(): void {
  try {
    localStorage.setItem(widthKey, String(currentWidth.value))
  } catch {
    // Not persisted.
  }
}

function startResize(event: PointerEvent): void {
  event.preventDefault()
  const startX = event.clientX
  const startWidth = currentWidth.value
  const direction = props.side === 'left' ? 1 : -1
  resizing.value = true
  const move = (e: PointerEvent) => {
    currentWidth.value = clampWidth(startWidth + direction * (e.clientX - startX))
  }
  const up = () => {
    resizing.value = false
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    saveWidth()
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function onHandleKey(event: KeyboardEvent): void {
  const grow = props.side === 'left' ? 'ArrowRight' : 'ArrowLeft'
  const shrink = props.side === 'left' ? 'ArrowLeft' : 'ArrowRight'
  const step = event.shiftKey ? 64 : 16
  if (event.key === grow) currentWidth.value = clampWidth(currentWidth.value + step)
  else if (event.key === shrink) currentWidth.value = clampWidth(currentWidth.value - step)
  else return
  event.preventDefault()
  saveWidth()
}

function resetWidth(): void {
  currentWidth.value = clampWidth(props.width ?? 240)
  saveWidth()
}

watch(collapsed, (value) => {
  try {
    localStorage.setItem(props.storageKey, value ? 'collapsed' : 'open')
  } catch {
    // Not persisted.
  }
})

const toggleIcon = computed(() => {
  if (props.side === 'left') return collapsed.value ? PanelLeftOpen : PanelLeftClose
  return collapsed.value ? PanelRightOpen : PanelRightClose
})
</script>

<template>
  <aside
    class="side-panel"
    :class="[`side-panel--${side}`, { 'is-collapsed': collapsed, 'is-resizing': resizing }]"
    :style="{ width: collapsed ? undefined : `${currentWidth}px` }"
    :aria-label="title"
    :data-testid="`panel-${side}`"
  >
    <div class="side-panel__header">
      <span v-if="!collapsed" class="side-panel__title">{{ title }}</span>
      <NTooltip :placement="side === 'left' ? 'right' : 'left'">
        <template #trigger>
          <NButton
            quaternary
            size="tiny"
            :aria-label="`${collapsed ? 'Show' : 'Hide'} ${title.toLowerCase()}`"
            :data-testid="`panel-${side}-toggle`"
            @click="collapsed = !collapsed"
          >
            <template #icon>
              <NIcon aria-hidden="true"><component :is="toggleIcon" /></NIcon>
            </template>
          </NButton>
        </template>
        {{ collapsed ? 'Show' : 'Hide' }} {{ title.toLowerCase() }}
      </NTooltip>
    </div>
    <div v-show="!collapsed" class="side-panel__body">
      <slot />
    </div>
    <div
      v-if="!collapsed"
      class="side-panel__handle"
      role="separator"
      aria-orientation="vertical"
      :aria-label="`Resize ${title.toLowerCase()}`"
      :aria-valuenow="currentWidth"
      :aria-valuemin="MIN_WIDTH"
      tabindex="0"
      title="Drag to resize · double-click to reset"
      :data-testid="`panel-${side}-resize`"
      @pointerdown="startResize"
      @keydown="onHandleKey"
      @dblclick="resetWidth"
    />
  </aside>
</template>

<style scoped>
.side-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  min-height: 0;
  background: var(--app-panel-bg);
}

.side-panel--left {
  border-right: 1px solid var(--app-border);
}

.side-panel--right {
  border-left: 1px solid var(--app-border);
}

.side-panel.is-collapsed {
  width: 36px;
}

.side-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  height: 36px;
  padding: 0 6px 0 12px;
  border-bottom: 1px solid var(--app-border);
  flex-shrink: 0;
}

.side-panel.is-collapsed .side-panel__header {
  justify-content: center;
  padding: 0;
}

.side-panel__title {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--app-text-muted);
}

.side-panel__handle {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 5;
  width: 8px;
  cursor: col-resize;
  touch-action: none;
}

.side-panel--left .side-panel__handle {
  right: -4px;
}

.side-panel--right .side-panel__handle {
  left: -4px;
}

.side-panel__handle:hover,
.side-panel__handle:focus-visible,
.side-panel.is-resizing .side-panel__handle {
  background: linear-gradient(
    to right,
    transparent 3px,
    var(--app-primary) 3px,
    var(--app-primary) 5px,
    transparent 5px
  );
  outline: none;
}

.side-panel.is-resizing {
  user-select: none;
}

.side-panel__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
</style>
