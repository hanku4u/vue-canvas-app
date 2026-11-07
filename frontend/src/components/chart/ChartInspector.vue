<script setup lang="ts">
import { computed } from 'vue'
import { NSelect, type SelectOption } from 'naive-ui'
import { useDatasets } from '@/data/query'
import type { ComponentViewProps } from '@/registry/types'
import { resolveChartFields } from './fields'
import type { ChartConfig } from './schema'

/** Column pickers for charts; '' means "automatic" (resolved from the dataset). */
const props = defineProps<ComponentViewProps<ChartConfig>>()
const emit = defineEmits<{ 'update-config': [patch: Partial<ChartConfig>] }>()

const datasets = useDatasets()
const dataset = computed(() => datasets.data.value?.find((d) => d.id === props.config.dataset))
const resolved = computed(() => resolveChartFields(dataset.value?.columns ?? [], props.config))
const label = (name: string) => dataset.value?.columns.find((c) => c.name === name)?.label ?? name

function options(filter: (type: string) => boolean): SelectOption[] {
  return (dataset.value?.columns ?? [])
    .filter((c) => filter(c.type))
    .map((c) => ({ label: c.label ?? c.name, value: c.name }))
}

const allColumns = computed(() => options(() => true))
const numericColumns = computed(() => options((t) => t === 'int' || t === 'float'))
const categoryColumns = computed(() => options((t) => t === 'string' || t === 'int'))

const auto = (value: string) => ({ label: `Auto (${value ? label(value) : 'none'})`, value: '' })

const xOptions = computed(() => [auto(resolved.value.x), ...allColumns.value])
const seriesOptions = computed(() => [
  auto(props.config.seriesBy === '' ? resolved.value.seriesBy : ''),
  { label: 'None', value: '-' },
  ...categoryColumns.value,
])
const groupOptions = computed(() => [auto(resolved.value.groupBy), ...categoryColumns.value])
const limitOptions = (name: keyof ChartConfig['limits']) => [
  {
    label: `Auto (${resolved.value.limits[name] ? label(resolved.value.limits[name]) : 'none'})`,
    value: '',
  },
  { label: 'None', value: '-' },
  ...numericColumns.value,
]

const usesX = computed(() => ['line', 'spc', 'scatter'].includes(props.config.kind))
const multiY = computed(() => props.config.kind === 'line')

function setLimit(name: keyof ChartConfig['limits'], value: string): void {
  emit('update-config', { limits: { ...props.config.limits, [name]: value } })
}
</script>

<template>
  <div v-if="dataset" class="chart-inspector" data-testid="chart-inspector">
    <label v-if="usesX" class="chart-inspector__field">
      <span>{{ config.kind === 'scatter' ? 'X axis' : 'Time / x axis' }}</span>
      <NSelect
        size="small"
        :value="config.x"
        :options="xOptions"
        :disabled="!editable"
        data-testid="chart-x"
        @update:value="(v: string) => emit('update-config', { x: v })"
      />
    </label>
    <label class="chart-inspector__field">
      <span>{{ multiY ? 'Values' : 'Value' }}</span>
      <NSelect
        size="small"
        :multiple="multiY"
        :value="multiY ? config.y : (config.y[0] ?? null)"
        :options="numericColumns"
        :placeholder="`Auto (${label(resolved.y[0] ?? '')})`"
        :disabled="!editable"
        clearable
        data-testid="chart-y"
        @update:value="
          (v: string | string[] | null) =>
            emit('update-config', { y: Array.isArray(v) ? v : v ? [v] : [] })
        "
      />
    </label>
    <label v-if="config.kind !== 'boxplot'" class="chart-inspector__field">
      <span>{{ config.kind === 'histogram' ? 'Overlay by' : 'Split series by' }}</span>
      <NSelect
        size="small"
        :value="config.seriesBy"
        :options="seriesOptions"
        :disabled="!editable"
        data-testid="chart-series"
        @update:value="(v: string) => emit('update-config', { seriesBy: v })"
      />
    </label>
    <label v-else class="chart-inspector__field">
      <span>Group by</span>
      <NSelect
        size="small"
        :value="config.groupBy"
        :options="groupOptions"
        :disabled="!editable"
        @update:value="(v: string) => emit('update-config', { groupBy: v })"
      />
    </label>
    <template v-if="config.kind === 'spc'">
      <p class="chart-inspector__heading">Limits</p>
      <div class="chart-inspector__limits">
        <label v-for="name in ['ucl', 'lcl', 'target', 'usl', 'lsl'] as const" :key="name">
          <span>{{ name.toUpperCase() }}</span>
          <NSelect
            size="small"
            :value="config.limits[name]"
            :options="limitOptions(name)"
            :disabled="!editable"
            @update:value="(v: string) => setLimit(name, v)"
          />
        </label>
      </div>
    </template>
  </div>
</template>

<style scoped>
.chart-inspector {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.chart-inspector__field,
.chart-inspector__limits label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--app-text-muted);
}

.chart-inspector__heading {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--app-text-muted);
}

.chart-inspector__limits {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
</style>
