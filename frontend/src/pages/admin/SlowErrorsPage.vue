<script setup lang="ts">
import { computed } from 'vue'
import { NDataTable, NSelect, NTabPane, NTabs } from 'naive-ui'
import { useErrorEvents, useSlowQueries } from '@/api/admin'
import AdminState from './AdminState.vue'
import { errorColumns, slowColumns } from './queryColumns'
import RangeSelect from './RangeSelect.vue'
import { useQueryParam, useRange } from './useRange'

/** Slow queries (above a threshold) and recent errors (docs/admin.md). */
const range = useRange()
const tab = useQueryParam('tab', 'slow')
const threshold = useQueryParam('threshold', '10000')
const code = useQueryParam('code')

const slow = useSlowQueries(range, () => Number(threshold.value))
const errors = useErrorEvents(range, code)

const thresholds = [
  { label: '> 2 s', value: '2000' },
  { label: '> 5 s', value: '5000' },
  { label: '> 10 s', value: '10000' },
  { label: '> 30 s', value: '30000' },
]
const codeOptions = computed(() => [
  { label: 'All codes', value: '' },
  ...(errors.data.value?.codes ?? []).map((c) => ({
    label: `${c.code} (${c.count})`,
    value: c.code,
  })),
])
</script>

<template>
  <section class="page">
    <header class="page__head">
      <h2>Slow queries &amp; errors</h2>
      <RangeSelect />
    </header>
    <NTabs v-model:value="tab" type="line" animated>
      <NTabPane name="slow" tab="Slow queries">
        <div class="page__tools filters">
          <NSelect
            v-model:value="threshold"
            size="small"
            :options="thresholds"
            style="width: 120px"
            data-testid="slow-threshold"
          />
        </div>
        <AdminState
          :pending="slow.isPending.value"
          :error="slow.error.value"
          :empty="!slow.data.value?.items.length"
          empty-text="No calls above this threshold."
          @retry="slow.refetch()"
        >
          <NDataTable
            :columns="slowColumns"
            :data="slow.data.value?.items ?? []"
            size="small"
            :pagination="{ pageSize: 25 }"
            :scroll-x="1000"
            data-testid="slow-table"
          />
        </AdminState>
      </NTabPane>
      <NTabPane name="errors" tab="Errors">
        <div class="page__tools filters">
          <NSelect
            v-model:value="code"
            size="small"
            :options="codeOptions"
            style="width: 240px"
            data-testid="error-code"
          />
        </div>
        <AdminState
          :pending="errors.isPending.value"
          :error="errors.error.value"
          :empty="!errors.data.value?.items.length"
          empty-text="No errors in this range."
          @retry="errors.refetch()"
        >
          <NDataTable
            :columns="errorColumns"
            :data="errors.data.value?.items ?? []"
            size="small"
            :pagination="{ pageSize: 25 }"
            :scroll-x="1000"
            data-testid="errors-table"
          />
        </AdminState>
      </NTabPane>
    </NTabs>
  </section>
</template>

<style scoped src="./page.css"></style>
<style scoped>
.filters {
  margin-bottom: 10px;
}
</style>
