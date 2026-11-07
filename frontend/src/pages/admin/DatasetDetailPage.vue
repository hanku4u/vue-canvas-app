<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { NBreadcrumb, NBreadcrumbItem, NCard, NDataTable, NList, NListItem } from 'naive-ui'
import { useDatasetDetail } from '@/api/admin'
import { formatDuration, formatPercent } from '@/ui/format'
import { STATUS, type ChartTokens } from '@/ui/vizPalette'
import AdminChart from './AdminChart.vue'
import AdminState from './AdminState.vue'
import { baseAxes } from './chartOptions'
import { slowColumns } from './queryColumns'
import RangeSelect from './RangeSelect.vue'
import StatTile from './StatTile.vue'
import { useRange } from './useRange'

/** One dataset: latency over time, errors by code, slowest calls, canvases using it. */
const props = defineProps<{ id: string }>()
const range = useRange()
const detail = useDatasetDetail(() => props.id, range)
const data = computed(() => detail.data.value)

// p50 and p95 share a unit and scale: one axis, two series, with a legend.
const latencyChart = (tokens: ChartTokens) => ({
  ...baseAxes(tokens, { time: true, yName: 'ms' }),
  legend: { bottom: 0, textStyle: { color: tokens.textMuted }, icon: 'roundRect' },
  grid: { left: 56, right: 16, top: 24, bottom: 40 },
  series: [
    {
      name: 'p50',
      type: 'line',
      showSymbol: false,
      lineStyle: { width: 2 },
      color: tokens.categorical[0],
      data: data.value?.latency.map((p) => [p.t, p.p50Ms]) ?? [],
    },
    {
      name: 'p95',
      type: 'line',
      showSymbol: false,
      lineStyle: { width: 2 },
      color: tokens.categorical[1],
      data: data.value?.latency.map((p) => [p.t, p.p95Ms]) ?? [],
    },
  ],
})

const errorsChart = (tokens: ChartTokens) => ({
  ...baseAxes(tokens),
  grid: { left: 140, right: 32, top: 8, bottom: 24 },
  xAxis: {
    type: 'value',
    axisLabel: { color: tokens.textMuted },
    splitLine: { lineStyle: { color: tokens.grid } },
  },
  yAxis: {
    type: 'category',
    inverse: true,
    axisLabel: { color: tokens.textMuted },
    data: data.value?.errorsByCode.map((e) => e.code) ?? [],
  },
  series: [
    {
      name: 'Errors',
      type: 'bar',
      barMaxWidth: 14,
      itemStyle: { borderRadius: [0, 4, 4, 0] },
      color: STATUS.critical,
      label: { show: true, position: 'right', color: tokens.textMuted },
      data: data.value?.errorsByCode.map((e) => e.count) ?? [],
    },
  ],
})
</script>

<template>
  <section class="page">
    <NBreadcrumb>
      <NBreadcrumbItem>
        <RouterLink :to="{ name: 'admin-datasets', query: { range } }">Datasets</RouterLink>
      </NBreadcrumbItem>
      <NBreadcrumbItem>{{ data?.dataset.label ?? id }}</NBreadcrumbItem>
    </NBreadcrumb>
    <header class="page__head">
      <h2 data-testid="dataset-title">{{ data?.dataset.label ?? id }}</h2>
      <RangeSelect />
    </header>
    <AdminState
      :pending="detail.isPending.value"
      :error="detail.error.value"
      @retry="detail.refetch()"
    >
      <template v-if="data">
        <div class="page__grid">
          <StatTile label="Calls" :value="data.dataset.calls.toLocaleString()" />
          <StatTile
            label="p50 / p95"
            :value="`${formatDuration(data.dataset.p50Ms)} / ${formatDuration(data.dataset.p95Ms)}`"
          />
          <StatTile label="Cache hit rate" :value="formatPercent(data.dataset.cacheHitRate, 0)" />
          <StatTile label="Error rate" :value="formatPercent(data.dataset.errorRate)" />
        </div>
        <div class="page__charts">
          <AdminChart label="Latency" :build="latencyChart" :height="240" />
          <AdminChart
            v-if="data.errorsByCode.length"
            label="Errors by code"
            :build="errorsChart"
            :height="240"
          />
          <NCard v-else size="small" title="Errors by code">
            <p class="muted">No errors in this range.</p>
          </NCard>
        </div>
        <h3 class="page__section">Slowest calls</h3>
        <NDataTable
          :columns="slowColumns"
          :data="data.slowest"
          size="small"
          :scroll-x="1000"
          data-testid="dataset-slowest"
        />
        <h3 class="page__section">Canvases using it</h3>
        <NList v-if="data.canvases.length" data-testid="dataset-canvases">
          <NListItem v-for="c in data.canvases" :key="c.id">
            <RouterLink :to="{ name: 'canvas', params: { id: c.id } }">{{ c.title }}</RouterLink>
            <span class="muted"> · {{ c.components }} components</span>
          </NListItem>
        </NList>
        <p v-else class="muted">No saved canvas uses this dataset.</p>
      </template>
    </AdminState>
  </section>
</template>

<style scoped src="./page.css"></style>
