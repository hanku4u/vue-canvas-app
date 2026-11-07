<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { NCard } from 'naive-ui'
import { useUsageOverview } from '@/api/admin'
import { STATUS, type ChartTokens } from '@/ui/vizPalette'
import { formatCompact, formatDuration, formatPercent } from '@/ui/format'
import AdminChart from './AdminChart.vue'
import AdminState from './AdminState.vue'
import { baseAxes } from './chartOptions'
import RangeSelect from './RangeSelect.vue'
import StatTile from './StatTile.vue'
import { useRange } from './useRange'

/** Usage overview (docs/admin.md): tiles, queries/errors per hour, users per day. */
const range = useRange()
const usage = useUsageOverview(range)
const data = computed(() => usage.data.value)

// Queries and errors differ by two orders of magnitude: two charts, never two y-axes.
const queriesChart = (tokens: ChartTokens) => ({
  ...baseAxes(tokens, { time: true }),
  series: [
    {
      name: 'Queries',
      type: 'line',
      showSymbol: false,
      lineStyle: { width: 2 },
      color: tokens.categorical[0],
      data: data.value?.hourly.map((h) => [h.t, h.queries]) ?? [],
    },
  ],
})

const errorsChart = (tokens: ChartTokens) => ({
  ...baseAxes(tokens, { time: true }),
  series: [
    {
      name: 'Errors',
      type: 'bar',
      barMaxWidth: 6,
      color: STATUS.critical,
      data: data.value?.hourly.map((h) => [h.t, h.errors]) ?? [],
    },
  ],
})

const usersChart = (tokens: ChartTokens) => ({
  ...baseAxes(tokens),
  xAxis: {
    ...baseAxes(tokens).xAxis,
    data: data.value?.dailyUsers.map((d) => d.day.slice(5)) ?? [],
  },
  series: [
    {
      name: 'Active users',
      type: 'bar',
      barMaxWidth: 18,
      itemStyle: { borderRadius: [4, 4, 0, 0] },
      color: tokens.categorical[0],
      data: data.value?.dailyUsers.map((d) => d.users) ?? [],
    },
  ],
})

const mixChart = (tokens: ChartTokens) => ({
  ...baseAxes(tokens),
  grid: { left: 96, right: 16, top: 8, bottom: 24 },
  xAxis: {
    type: 'value',
    axisLabel: { color: tokens.textMuted },
    splitLine: { lineStyle: { color: tokens.grid } },
  },
  yAxis: {
    type: 'category',
    inverse: true,
    axisLabel: { color: tokens.textMuted },
    data: data.value?.componentMix.map((m) => m.type) ?? [],
  },
  series: [
    {
      name: 'Components',
      type: 'bar',
      barMaxWidth: 14,
      itemStyle: { borderRadius: [0, 4, 4, 0] },
      color: tokens.categorical[0],
      label: { show: true, position: 'right', color: tokens.textMuted },
      data: data.value?.componentMix.map((m) => m.count) ?? [],
    },
  ],
})
</script>

<template>
  <section class="page">
    <header class="page__head">
      <h2>Usage</h2>
      <RangeSelect />
    </header>
    <AdminState
      :pending="usage.isPending.value"
      :error="usage.error.value"
      @retry="usage.refetch()"
    >
      <template v-if="data">
        <div class="page__grid" data-testid="usage-tiles">
          <StatTile label="Active users" :value="String(data.tiles.activeUsers)" />
          <StatTile label="Queries" :value="formatCompact(data.tiles.queries)" />
          <StatTile label="Cache hit rate" :value="formatPercent(data.tiles.cacheHitRate, 0)" />
          <StatTile label="Error rate" :value="formatPercent(data.tiles.errorRate)" />
          <StatTile label="p95 query time" :value="formatDuration(data.tiles.p95Ms)" />
          <StatTile label="Canvases created" :value="String(data.tiles.canvasesCreated)" />
        </div>
        <div class="page__charts">
          <AdminChart label="Queries per hour" :build="queriesChart" />
          <AdminChart label="Errors per hour" :build="errorsChart" />
          <AdminChart label="Active users per day" :build="usersChart" />
          <AdminChart
            label="Components on canvases, by type"
            :build="mixChart"
            :height="40 + 32 * Math.max(2, data.componentMix.length)"
          />
        </div>
        <NCard size="small" title="Top canvases by queries">
          <ol class="top" data-testid="top-canvases">
            <li v-for="c in data.topCanvases" :key="c.id">
              <RouterLink :to="{ name: 'canvas', params: { id: c.id } }">{{ c.title }}</RouterLink>
              <span class="muted">{{ c.queries.toLocaleString() }} queries</span>
            </li>
          </ol>
        </NCard>
      </template>
    </AdminState>
  </section>
</template>

<style scoped src="./page.css"></style>
<style scoped>
.top {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding-left: 20px;
}

.top li::marker {
  color: var(--app-text-muted);
}

.top li span {
  margin-left: 8px;
}
</style>
