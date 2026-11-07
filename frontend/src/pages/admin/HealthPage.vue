<script setup lang="ts">
import { computed } from 'vue'
import { NCard, NProgress } from 'naive-ui'
import { useHealth } from '@/api/admin'
import { formatBytes, formatDateTime, formatPercent, formatRelativeTime } from '@/ui/format'
import { STATUS, type ChartTokens } from '@/ui/vizPalette'
import AdminChart from './AdminChart.vue'
import AdminState from './AdminState.vue'
import { baseAxes } from './chartOptions'
import HealthStatus from './HealthStatus.vue'

/** Live status, refreshed every 30 s (docs/admin.md, Health). */
const health = useHealth()
const data = computed(() => health.data.value)

// Latency line with gaps where the check failed, and failures marked on the baseline.
const historyChart = (tokens: ChartTokens) => ({
  ...baseAxes(tokens, { time: true, yName: 'ms' }),
  grid: { left: 48, right: 16, top: 24, bottom: 28 },
  series: [
    {
      name: 'Latency',
      type: 'line',
      showSymbol: false,
      connectNulls: false,
      lineStyle: { width: 2 },
      color: tokens.categorical[0],
      data: data.value?.dataApi.history.map((p) => [p.t, p.latencyMs]) ?? [],
    },
    {
      name: 'Failed check',
      type: 'scatter',
      symbol: 'triangle',
      symbolSize: 9,
      color: STATUS.critical,
      data: data.value?.dataApi.history.filter((p) => !p.ok).map((p) => [p.t, 0]) ?? [],
    },
  ],
})
</script>

<template>
  <section class="page">
    <header class="page__head">
      <h2>Health</h2>
      <span v-if="data" class="muted" data-testid="health-checked">
        Checked {{ formatRelativeTime(data.checkedAt) }} · refreshes every 30 s
      </span>
    </header>
    <AdminState
      :pending="health.isPending.value"
      :error="health.error.value"
      @retry="health.refetch()"
    >
      <template v-if="data">
        <div class="cards">
          <NCard size="small" data-testid="health-data-api">
            <template #header>Data API</template>
            <template #header-extra><HealthStatus :status="data.dataApi.status" /></template>
            <dl>
              <dt>Latency</dt>
              <dd>{{ data.dataApi.latencyMs === null ? '—' : `${data.dataApi.latencyMs} ms` }}</dd>
              <dt>Last success</dt>
              <dd>
                {{ data.dataApi.lastSuccess ? formatDateTime(data.dataApi.lastSuccess) : '—' }}
              </dd>
              <template v-if="data.dataApi.lastFailure">
                <dt>Last failure</dt>
                <dd>
                  {{ formatDateTime(data.dataApi.lastFailure.at) }}<br />
                  <small class="muted">{{ data.dataApi.lastFailure.message }}</small>
                </dd>
              </template>
            </dl>
          </NCard>
          <NCard size="small" data-testid="health-database">
            <template #header>PostgreSQL</template>
            <template #header-extra><HealthStatus :status="data.database.status" /></template>
            <dl>
              <dt>Pool</dt>
              <dd>
                {{ data.database.poolInUse }} of {{ data.database.poolSize }} connections in use
              </dd>
            </dl>
          </NCard>
          <NCard size="small" data-testid="health-cache">
            <template #header>Query cache</template>
            <template #header-extra><HealthStatus :status="data.cache.status" /></template>
            <dl>
              <dt>Size</dt>
              <dd>
                {{ formatBytes(data.cache.bytes) }} of {{ formatBytes(data.cache.maxBytes) }} ·
                {{ data.cache.entries }} entries
                <NProgress
                  type="line"
                  :percentage="Math.round((100 * data.cache.bytes) / data.cache.maxBytes)"
                  :show-indicator="false"
                  :height="6"
                />
              </dd>
              <dt>Hit rate</dt>
              <dd>{{ formatPercent(data.cache.hitRate, 0) }}</dd>
              <dt>Evictions</dt>
              <dd>{{ data.cache.evictions.toLocaleString() }}</dd>
            </dl>
          </NCard>
          <NCard size="small" data-testid="health-concurrency">
            <template #header>Upstream concurrency</template>
            <template #header-extra><HealthStatus :status="data.concurrency.status" /></template>
            <dl>
              <dt>In flight</dt>
              <dd>{{ data.concurrency.inFlight }} of {{ data.concurrency.cap }}</dd>
              <dt>Queued</dt>
              <dd>{{ data.concurrency.queued }}</dd>
            </dl>
          </NCard>
          <NCard size="small" data-testid="health-app">
            <template #header>App</template>
            <template #header-extra><HealthStatus :status="data.app.status" /></template>
            <dl>
              <dt>Version</dt>
              <dd>{{ data.app.version }} ({{ data.app.commit }})</dd>
              <dt>Up since</dt>
              <dd>{{ formatDateTime(data.app.startedAt) }}</dd>
              <dt>Datasets</dt>
              <dd>
                {{ data.app.datasetsLoaded }} loaded, {{ data.app.datasetLoadErrors.length }} load
                errors
              </dd>
            </dl>
          </NCard>
        </div>
        <AdminChart label="Data API checks, last 24 hours" :build="historyChart" :height="200" />
      </template>
    </AdminState>
  </section>
</template>

<style scoped src="./page.css"></style>
<style scoped>
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  margin: 0;
  font-size: 13px;
}

dt {
  color: var(--app-text-muted);
}

dd {
  margin: 0;
}
</style>
