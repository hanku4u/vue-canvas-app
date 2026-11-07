<script setup lang="ts">
import { computed, h, type HTMLAttributes } from 'vue'
import { RouterLink } from 'vue-router'
import { NDataTable, type DataTableColumns } from 'naive-ui'
import { useDatasetUsage, type DatasetUsage } from '@/api/admin'
import { formatCompact, formatDuration, formatPercent } from '@/ui/format'
import AdminState from './AdminState.vue'
import RangeSelect from './RangeSelect.vue'
import { useRange } from './useRange'

/** Per-dataset stats (docs/admin.md, Datasets). Click a dataset for its detail. */
const range = useRange()
const usage = useDatasetUsage(range)

const num = (key: keyof DatasetUsage, format: (v: number) => string) => ({
  key,
  align: 'right' as const,
  sorter: (a: DatasetUsage, b: DatasetUsage) => (a[key] as number) - (b[key] as number),
  render: (row: DatasetUsage) => format(row[key] as number),
})

const columns = computed<DataTableColumns<DatasetUsage>>(() => [
  {
    title: 'Dataset',
    key: 'id',
    render: (row) =>
      h(
        RouterLink,
        { to: { name: 'admin-dataset', params: { id: row.id }, query: { range: range.value } } },
        () => row.label,
      ),
  },
  { title: 'Calls', ...num('calls', (v) => v.toLocaleString()), defaultSortOrder: 'descend' },
  { title: 'Users', ...num('users', String) },
  { title: 'Cache hit', ...num('cacheHitRate', (v) => formatPercent(v, 0)) },
  { title: 'p50', ...num('p50Ms', formatDuration) },
  { title: 'p95', ...num('p95Ms', formatDuration) },
  { title: 'Errors', ...num('errorRate', (v) => formatPercent(v)) },
  { title: 'Avg upstream rows', ...num('avgUpstreamRows', formatCompact) },
  { title: 'Avg returned rows', ...num('avgReturnedRows', formatCompact) },
])
</script>

<template>
  <section class="page">
    <header class="page__head">
      <h2>Dataset usage</h2>
      <RangeSelect />
    </header>
    <AdminState
      :pending="usage.isPending.value"
      :error="usage.error.value"
      :empty="!usage.data.value?.items.length"
      @retry="usage.refetch()"
    >
      <NDataTable
        :columns="columns"
        :data="usage.data.value?.items ?? []"
        :row-key="(r: DatasetUsage) => r.id"
        :row-props="(r: DatasetUsage) => ({ 'data-dataset': r.id }) as HTMLAttributes"
        size="small"
        :scroll-x="900"
        data-testid="datasets-table"
      />
    </AdminState>
  </section>
</template>

<style scoped src="./page.css"></style>
