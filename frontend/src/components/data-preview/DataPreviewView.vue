<script setup lang="ts">
import { computed } from 'vue'
import type { ColumnType, Shape } from '@/api/types'
import { useComponentQuery } from '@/data/useComponentQuery'
import type { ComponentViewProps } from '@/registry/types'
import DataStateView from '../shared/DataStateView.vue'
import { refreshSeconds } from '../shared/dataConfig'
import type { DataPreviewConfig } from './schema'

/** Raw first rows of any dataset: for exploring data and debugging queries. */
const props = defineProps<ComponentViewProps<DataPreviewConfig>>()

const query = useComponentQuery({
  componentId: computed(() => props.component.id),
  dataset: computed(() => props.config.dataset),
  params: computed(() => props.config.params),
  shape: computed<Shape>(() => ({ kind: 'raw', limit: props.config.limit })),
  refreshSec: computed(() => refreshSeconds(props.config.refresh)),
})

const labels = computed(
  () => new Map(query.dataset.value?.columns.map((c) => [c.name, c.label ?? c.name]) ?? []),
)

const rows = computed(() => {
  const result = query.result.value
  if (!result) return []
  const length = Object.values(result.data)[0]?.length ?? 0
  return Array.from({ length }, (_, i) => result.columns.map((c) => result.data[c.name]?.[i]))
})

function format(value: unknown, type: ColumnType | 'unknown'): string {
  if (value === null || value === undefined) return ''
  if (type === 'datetime' && typeof value === 'string') {
    return new Date(value).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
  }
  if (type === 'float' && typeof value === 'number') return String(Number(value.toPrecision(6)))
  if (Array.isArray(value)) return value.join(', ')
  return String(value)
}
</script>

<template>
  <DataStateView
    :state="query.state.value"
    :error="query.error.value"
    :missing="query.missing.value"
    :params="query.params.value"
    @retry="query.retry"
  >
    <div class="preview">
      <div class="preview__scroll" :class="{ nowheel: active }">
        <table class="preview__table" data-testid="preview-table">
          <thead>
            <tr>
              <th v-for="column in query.result.value?.columns ?? []" :key="column.name">
                {{ labels.get(column.name) ?? column.name }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in rows" :key="i">
              <td
                v-for="(value, j) in row"
                :key="j"
                :class="{
                  'is-number': ['int', 'float'].includes(query.result.value!.columns[j]!.type),
                }"
              >
                {{ format(value, query.result.value!.columns[j]!.type) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <footer class="preview__footer" data-testid="preview-footer">
        {{ rows.length.toLocaleString() }} of
        {{ (query.result.value?.meta.rowsUpstream ?? 0).toLocaleString() }} rows
      </footer>
    </div>
  </DataStateView>
</template>

<style scoped>
.preview {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.preview__scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.preview__table {
  border-collapse: collapse;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.preview__table th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 4px 8px;
  background: var(--app-bg);
  border-bottom: 1px solid var(--app-border);
  text-align: left;
  font-weight: 600;
}

.preview__table td {
  padding: 2px 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--app-border) 50%, transparent);
}

.preview__table td.is-number {
  text-align: right;
}

.preview__footer {
  padding: 2px 8px;
  border-top: 1px solid var(--app-border);
  font-size: 11px;
  color: var(--app-text-muted);
  flex-shrink: 0;
}
</style>
