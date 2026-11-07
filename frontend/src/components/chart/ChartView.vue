<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import VChart from 'vue-echarts'
import { NButton, NIcon, NTooltip } from 'naive-ui'
import { TriangleExclamationPoint } from '@lucide/vue'
import type { ColumnType } from '@/api/types'
import { isDark } from '@/app/colorScheme'
import { useDatasets } from '@/data/query'
import { useComponentQuery } from '@/data/useComponentQuery'
import type { ComponentViewProps } from '@/registry/types'
import { useComponentDataStore } from '@/stores/componentData'
import { STATUS, chartTokens, ColorSlots } from '@/ui/vizPalette'
import DataStateView from '../shared/DataStateView.vue'
import { refreshSeconds } from '../shared/dataConfig'
import { registerECharts } from './echarts'
import { chartShape, resolveChartFields } from './fields'
import { buildChart } from './options'
import type { ChartConfig } from './schema'

registerECharts()

/** Charts (docs/components.md#chart): trend, scatter, histogram, box plot and SPC. */
const props = defineProps<ComponentViewProps<ChartConfig>>()

const dataStore = useComponentDataStore()

// Session zoom on a time axis: refetches that range at full resolution.
const xRange = ref<[string, string] | null>(null)

// The dataset is needed to resolve the chart's fields (and so its query shape) first.
const datasets = useDatasets()
const dataset = computed(() => datasets.data.value?.find((d) => d.id === props.config.dataset))
const fields = computed(() => resolveChartFields(dataset.value?.columns ?? [], props.config))

const query = useComponentQuery({
  componentId: computed(() => props.component.id),
  dataset: computed(() => props.config.dataset),
  params: computed(() => props.config.params),
  shape: computed(() =>
    dataset.value
      ? chartShape(props.config.kind, fields.value, {
          width: props.component.w,
          bins: props.config.bins,
          xRange: xRange.value,
        })
      : null,
  ),
  refreshSec: computed(() => refreshSeconds(props.config.refresh)),
})

watch(
  () => [props.config.dataset, JSON.stringify(props.config.params), props.config.kind],
  () => (xRange.value = null),
)

const colorSlots = new ColorSlots()
const tokens = computed(() => chartTokens(isDark.value))

const built = computed(() => {
  const result = query.result.value
  if (!result || !dataset.value || !fields.value.y.length) return null
  const meta = new Map(dataset.value.columns.map((c) => [c.name, c]))
  return buildChart(result, {
    kind: props.config.kind,
    fields: fields.value,
    tokens: tokens.value,
    colors: colorSlots,
    labels: new Map([...meta].map(([k, c]) => [k, c.label ?? k])),
    types: new Map<string, ColumnType | 'unknown'>([...meta].map(([k, c]) => [k, c.type])),
    tooltipColumns: dataset.value.tooltip,
    yLog: props.config.yLog,
    legend: props.config.legend,
  })
})

const timeAxis = computed(
  () =>
    (props.config.kind === 'line' || props.config.kind === 'spc') &&
    dataset.value?.columns.find((c) => c.name === fields.value.x)?.type === 'datetime',
)

// ---------------------------------------------------------------------------
// Zoom: box-zoom (while the chart is active) refetches the selected time range.
// ---------------------------------------------------------------------------

const chart = shallowRef<InstanceType<typeof VChart> | null>(null)

function syncZoomCursor(): void {
  void nextTick(() => {
    chart.value?.dispatchAction({
      type: 'takeGlobalCursor',
      key: 'dataZoomSelect',
      dataZoomSelectActive: props.active && timeAxis.value,
    })
  })
}

watch(() => [props.active, built.value], syncZoomCursor)

function onDataZoom(event: unknown): void {
  const range = (event as { batch?: { startValue?: number; endValue?: number }[] }).batch?.[0]
  if (!timeAxis.value || range?.startValue === undefined || range.endValue === undefined) return
  xRange.value = [new Date(range.startValue).toISOString(), new Date(range.endValue).toISOString()]
}

function resetZoom(): void {
  xRange.value = null
}

// Snapshot for the zoomed-out preview, after each render with new data.
let snapshotFor: unknown = null
function onFinished(): void {
  if (!chart.value || snapshotFor === built.value) return
  syncZoomCursor()
  snapshotFor = built.value
  try {
    const url = chart.value.getDataURL({
      type: 'png',
      pixelRatio: 1,
      backgroundColor: tokens.value.surface,
    })
    dataStore.setSnapshot(props.component.id, url)
  } catch {
    // Not critical: the preview falls back to a placeholder.
  }
}

const meta = computed(() => query.result.value?.meta)
</script>

<template>
  <DataStateView
    :state="query.state.value"
    :error="query.error.value"
    :missing="query.missing.value"
    :params="query.params.value"
    @retry="query.retry"
  >
    <div class="chart" :class="{ nowheel: active }" data-testid="chart" :data-kind="config.kind">
      <VChart
        v-if="built"
        ref="chart"
        class="chart__canvas"
        :option="built.option"
        :update-options="{ notMerge: true }"
        autoresize
        @datazoom="onDataZoom"
        @finished="onFinished"
        @zr:dblclick="resetZoom"
      />
      <div class="chart__overlay">
        <span v-if="active && timeAxis && !xRange" class="chart__note">Drag to zoom</span>
        <NTooltip v-if="config.kind === 'spc' && built">
          <template #trigger>
            <span
              class="chart__badge"
              :class="{ 'is-alert': built.ooc > 0 }"
              data-testid="ooc-badge"
            >
              <NIcon v-if="built.ooc > 0" :size="12" :color="STATUS.critical">
                <TriangleExclamationPoint />
              </NIcon>
              {{ built.ooc }} OOC
            </span>
          </template>
          Points beyond the control limits (shown as red diamonds).
        </NTooltip>
        <NTooltip v-if="meta?.downsampled && (config.kind === 'line' || config.kind === 'spc')">
          <template #trigger>
            <span class="chart__note" data-testid="downsampled">
              {{ meta.rowsReturned.toLocaleString() }} of
              {{ meta.rowsUpstream.toLocaleString() }} points
            </span>
          </template>
          Downsampled on the server (LTTB) for display; spikes and excursions are kept. Box-zoom to
          see a range at full resolution.
        </NTooltip>
        <NButton
          v-if="xRange"
          size="tiny"
          class="nodrag"
          data-testid="reset-zoom"
          @click.stop="resetZoom"
        >
          Reset zoom
        </NButton>
      </div>
    </div>
  </DataStateView>
</template>

<style scoped>
.chart {
  position: relative;
  height: 100%;
}

.chart__canvas {
  width: 100%;
  height: 100%;
}

.chart__overlay {
  position: absolute;
  top: 6px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  pointer-events: none;
}

.chart__overlay > * {
  pointer-events: auto;
}

.chart__badge,
.chart__note {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0 6px;
  border-radius: 8px;
  background: var(--app-bg);
  border: 1px solid var(--app-border);
  font-size: 11px;
  color: var(--app-text-muted);
}

.chart__badge.is-alert {
  color: var(--app-text);
  font-weight: 600;
}
</style>
