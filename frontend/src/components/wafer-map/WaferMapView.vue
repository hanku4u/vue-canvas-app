<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { NButton, NIcon, NSelect } from 'naive-ui'
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import type { Shape } from '@/api/types'
import { isDark } from '@/app/colorScheme'
import { useDatasets } from '@/data/query'
import { useComponentQuery } from '@/data/useComponentQuery'
import type { ComponentViewProps } from '@/registry/types'
import { useCanvasUiStore } from '@/stores/canvasUi'
import { useComponentDataStore } from '@/stores/componentData'
import DataStateView from '../shared/DataStateView.vue'
import { refreshSeconds } from '../shared/dataConfig'
import { colorScale } from './colorScale'
import type { Die } from './geometry'
import WaferCanvas from './WaferCanvas.vue'
import type { WaferMapConfig } from './schema'

/** Wafer maps (docs/components.md#wafer-map): one wafer, a gallery, or stacked. */
const props = defineProps<ComponentViewProps<WaferMapConfig>>()

const PAGE_SIZE = 25

const ui = useCanvasUiStore()
const dataStore = useComponentDataStore()
const datasets = useDatasets()
const dataset = computed(() => datasets.data.value?.find((d) => d.id === props.config.dataset))

const valueColumn = computed(() => {
  const columns = dataset.value?.columns ?? []
  if (props.config.value && columns.some((c) => c.name === props.config.value)) {
    return props.config.value
  }
  return (
    columns.find((c) => c.name === 'value')?.name ??
    columns.find((c) => c.type === 'float' || c.type === 'int')?.name ??
    ''
  )
})

// Session state: which wafer (single) / which page (gallery).
const knownWafers = ref<string[]>([])
const selectedWafer = ref<string | null>(null)
const page = ref(0)
const pageCount = computed(() => Math.max(1, Math.ceil(knownWafers.value.length / PAGE_SIZE)))

watch(
  () => [props.config.dataset, JSON.stringify(props.config.params)],
  () => {
    knownWafers.value = []
    selectedWafer.value = null
    page.value = 0
  },
)

const shape = computed<Shape | null>(() => {
  if (!dataset.value || !valueColumn.value) return null
  const base = {
    kind: 'wafer' as const,
    x: 'x',
    y: 'y',
    value: valueColumn.value,
    waferBy: 'wafer_id',
    mode: props.config.mode,
    aggregate: props.config.aggregate,
  }
  if (props.config.mode === 'single' && selectedWafer.value) {
    return { ...base, wafers: [selectedWafer.value] }
  }
  if (props.config.mode === 'gallery' && knownWafers.value.length > PAGE_SIZE) {
    const start = page.value * PAGE_SIZE
    return { ...base, wafers: knownWafers.value.slice(start, start + PAGE_SIZE) }
  }
  return base
})

const query = useComponentQuery({
  componentId: computed(() => props.component.id),
  dataset: computed(() => props.config.dataset),
  params: computed(() => props.config.params),
  bindings: computed(() => props.config.bindings),
  shape,
  refreshSec: computed(() => refreshSeconds(props.config.refresh)),
})

watch(
  () => query.result.value?.meta.wafers,
  (wafers) => {
    if (wafers && JSON.stringify(wafers) !== JSON.stringify(knownWafers.value)) {
      knownWafers.value = wafers
    }
  },
)

// ---------------------------------------------------------------------------
// Data for drawing
// ---------------------------------------------------------------------------

interface WaferData {
  id: string
  lot: string
  dies: Die[]
}

const wafers = computed<WaferData[]>(() => {
  const result = query.result.value
  if (!result) return []
  const ids = result.data.wafer_id ?? []
  const lots = result.data.lot_id ?? []
  const xs = result.data.x ?? []
  const ys = result.data.y ?? []
  const vs = result.data.value ?? []
  const byWafer = new Map<string, WaferData>()
  for (let i = 0; i < ids.length; i += 1) {
    const id = String(ids[i])
    let entry = byWafer.get(id)
    if (!entry) {
      entry = { id, lot: String(lots[i] ?? ''), dies: [] }
      byWafer.set(id, entry)
    }
    entry.dies.push({ x: Number(xs[i]), y: Number(ys[i]), value: Number(vs[i]) })
  }
  return [...byWafer.values()].sort((a, b) =>
    a.id.localeCompare(b.id, undefined, { numeric: true }),
  )
})

const extent = computed(() => {
  const meta = query.result.value?.meta
  return {
    xMin: meta?.xRange?.[0] ?? 0,
    xMax: meta?.xRange?.[1] ?? 0,
    yMin: meta?.yRange?.[0] ?? 0,
    yMax: meta?.yRange?.[1] ?? 0,
  }
})

// One color scale shared by every map shown, so wafers can be compared.
const scale = computed(() =>
  colorScale(
    wafers.value.flatMap((w) => w.dies.map((d) => d.value)),
    {
      palette: props.config.palette,
      range: props.config.range,
      rangeMin: props.config.rangeMin,
      rangeMax: props.config.rangeMax,
      center: props.config.center,
      dark: isDark.value,
    },
  ),
)

const colors = computed(() =>
  isDark.value
    ? { outline: '#71717a', grid: 'rgba(0,0,0,0.35)' }
    : { outline: '#94a3b8', grid: 'rgba(255,255,255,0.6)' },
)

const unit = computed(() => {
  const units = query.result.value?.data.unit
  return units?.length ? String(units[0]) : ''
})

const column = computed(
  () =>
    dataset.value?.columns.find((c) => c.name === valueColumn.value)?.label ?? valueColumn.value,
)

function fmt(value: number): string {
  return value.toLocaleString(undefined, { maximumSignificantDigits: 4 })
}

// ---------------------------------------------------------------------------
// Hover, selection, snapshot
// ---------------------------------------------------------------------------

const hover = ref<{ die: Die; wafer: WaferData; x: number; y: number } | null>(null)
const root = ref<HTMLDivElement | null>(null)

function onHover(wafer: WaferData, die: Die | null, event: MouseEvent): void {
  const rect = root.value?.getBoundingClientRect()
  hover.value =
    die && rect ? { die, wafer, x: event.clientX - rect.left, y: event.clientY - rect.top } : null
}

const selected = computed(
  () => new Set((ui.rowSelections[props.component.id] ?? []).map((r) => String(r.wafer_id))),
)

function select(wafer: WaferData, event: MouseEvent): void {
  const row = { wafer_id: wafer.id, lot_id: wafer.lot }
  const current = ui.rowSelections[props.component.id] ?? []
  const already = selected.value.has(wafer.id)
  const additive = event.shiftKey || event.ctrlKey || event.metaKey
  const next = additive
    ? already
      ? current.filter((r) => r.wafer_id !== wafer.id)
      : [...current, row]
    : already && current.length === 1
      ? []
      : [row]
  ui.setRowSelection(props.component.id, next)
}

const firstCanvas = shallowRef<InstanceType<typeof WaferCanvas> | null>(null)
function onDrawn(index: number): void {
  if (index !== 0) return
  const url = firstCanvas.value?.toDataUrl()
  if (url) dataStore.setSnapshot(props.component.id, url)
}

function setRef(index: number, el: unknown): void {
  if (index === 0) firstCanvas.value = el as InstanceType<typeof WaferCanvas> | null
}

const singleOptions = computed(() => knownWafers.value.map((w) => ({ label: w, value: w })))
const currentSingle = computed(() => selectedWafer.value ?? wafers.value[0]?.id ?? null)

function stepWafer(delta: number): void {
  const list = knownWafers.value
  const index = list.indexOf(currentSingle.value ?? '')
  const next = list[Math.min(list.length - 1, Math.max(0, index + delta))]
  if (next) selectedWafer.value = next
}

const legendGradient = computed(() => `linear-gradient(to right, ${scale.value.stops.join(', ')})`)
</script>

<template>
  <DataStateView
    :state="query.state.value"
    :error="query.error.value"
    :missing="query.missing.value"
    :params="query.params.value"
    @retry="query.retry"
  >
    <div ref="root" class="wafer" :data-mode="config.mode" data-testid="wafer-map">
      <div class="wafer__toolbar nodrag">
        <template v-if="config.mode === 'single'">
          <NButton
            quaternary
            circle
            size="tiny"
            aria-label="Previous wafer"
            @click.stop="stepWafer(-1)"
          >
            <template #icon>
              <NIcon><ChevronLeft /></NIcon>
            </template>
          </NButton>
          <NSelect
            size="tiny"
            class="wafer__picker"
            :value="currentSingle"
            :options="singleOptions"
            filterable
            data-testid="wafer-picker"
            @update:value="(v: string) => (selectedWafer = v)"
          />
          <NButton quaternary circle size="tiny" aria-label="Next wafer" @click.stop="stepWafer(1)">
            <template #icon>
              <NIcon><ChevronRight /></NIcon>
            </template>
          </NButton>
        </template>
        <span v-else-if="config.mode === 'stacked'" class="wafer__caption">
          {{ config.aggregate }} of {{ knownWafers.length }} wafers per die
        </span>
        <template v-else>
          <span class="wafer__caption" data-testid="wafer-count">
            {{ knownWafers.length }} wafers
          </span>
          <template v-if="pageCount > 1">
            <NButton size="tiny" :disabled="page === 0" @click.stop="page -= 1">‹</NButton>
            <span class="wafer__caption">page {{ page + 1 }} / {{ pageCount }}</span>
            <NButton size="tiny" :disabled="page >= pageCount - 1" @click.stop="page += 1">
              ›
            </NButton>
          </template>
        </template>
      </div>

      <div
        class="wafer__maps"
        :class="config.mode === 'gallery' ? 'is-gallery' : 'is-single'"
        :data-own-keyboard="config.mode === 'single' ? '' : undefined"
      >
        <figure
          v-for="(wafer, index) in wafers"
          :key="wafer.id"
          class="wafer__tile"
          :class="{ 'is-selected': selected.has(wafer.id) }"
          data-testid="wafer-tile"
          :data-wafer="wafer.id"
          @click="select(wafer, $event)"
        >
          <figcaption v-if="config.mode === 'gallery'" class="wafer__title">
            {{ wafer.id.split('.').pop() }}
          </figcaption>
          <WaferCanvas
            :ref="(el) => setRef(index, el)"
            :dies="wafer.dies"
            :extent="extent"
            :scale="scale"
            :flip-x="config.flipX"
            :flip-y="config.flipY"
            :notch="config.notch"
            :show-grid="config.showGrid"
            :show-outline="config.showOutline"
            :outline-color="colors.outline"
            :grid-color="colors.grid"
            @hover="(die, e) => onHover(wafer, die, e)"
            @drawn="onDrawn(index)"
          />
        </figure>
      </div>

      <footer class="wafer__legend" data-testid="wafer-legend">
        <span class="wafer__legend-label"
          >{{ column }}<template v-if="unit"> ({{ unit }})</template></span
        >
        <span class="wafer__legend-value">{{ fmt(scale.min) }}</span>
        <span class="wafer__legend-bar" :style="{ background: legendGradient }">
          <span v-if="scale.center !== null" class="wafer__legend-center" />
        </span>
        <span class="wafer__legend-value">{{ fmt(scale.max) }}</span>
        <span v-if="config.range !== 'auto'" class="wafer__legend-note">clamped</span>
      </footer>

      <div
        v-if="hover"
        class="wafer__tooltip"
        :style="{ left: `${hover.x + 12}px`, top: `${hover.y + 12}px` }"
        data-testid="wafer-tooltip"
      >
        <strong>{{ fmt(hover.die.value) }}</strong> {{ unit }}<br />
        Die {{ hover.die.x }}, {{ hover.die.y }}<br />
        <template v-if="config.mode !== 'stacked'">{{ hover.wafer.id }}</template>
        <template v-else>{{ config.aggregate }} of {{ knownWafers.length }} wafers</template>
      </div>
    </div>
  </DataStateView>
</template>

<style scoped>
.wafer {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.wafer__toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 2px 8px;
  flex-shrink: 0;
}

.wafer__picker {
  width: 150px;
}

.wafer__caption {
  font-size: 11px;
  color: var(--app-text-muted);
}

.wafer__maps {
  flex: 1;
  min-height: 0;
  padding: 0 8px;
}

.wafer__maps.is-single .wafer__tile {
  height: 100%;
}

.wafer__maps.is-gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  grid-auto-rows: minmax(96px, 1fr);
  gap: 6px;
  overflow: auto;
}

.wafer__tile {
  display: flex;
  flex-direction: column;
  margin: 0;
  min-height: 0;
  border-radius: 6px;
  border: 1px solid transparent;
  cursor: pointer;
}

.wafer__tile.is-selected {
  border-color: var(--app-primary);
  box-shadow: 0 0 0 1px var(--app-primary);
}

.wafer__title {
  font-size: 11px;
  text-align: center;
  color: var(--app-text-muted);
}

.wafer__legend {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  font-size: 11px;
  color: var(--app-text-muted);
  flex-shrink: 0;
}

.wafer__legend-bar {
  position: relative;
  flex: 1;
  max-width: 220px;
  height: 8px;
  border-radius: 4px;
}

.wafer__legend-center {
  position: absolute;
  left: 50%;
  top: -2px;
  bottom: -2px;
  width: 1px;
  background: var(--app-text-muted);
}

.wafer__legend-value {
  font-variant-numeric: tabular-nums;
}

.wafer__legend-note {
  font-style: italic;
}

.wafer__tooltip {
  position: absolute;
  z-index: 2;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid var(--app-border);
  background: var(--app-panel-bg);
  font-size: 12px;
  pointer-events: none;
  white-space: nowrap;
}
</style>
