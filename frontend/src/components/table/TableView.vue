<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { AgGridVue } from 'ag-grid-vue3'
import { useQueryClient } from '@tanstack/vue-query'
import type {
  ColumnState,
  GridApi,
  GridReadyEvent,
  IDatasource,
  RowSelectionOptions,
} from 'ag-grid-community'
import type { ColumnType, QueryResult, Shape } from '@/api/types'
import { isDark } from '@/app/colorScheme'
import { postQuery } from '@/data/query'
import { useComponentQuery } from '@/data/useComponentQuery'
import type { ComponentViewProps } from '@/registry/types'
import { useCanvasUiStore } from '@/stores/canvasUi'
import DataStateView from '../shared/DataStateView.vue'
import { refreshSeconds } from '../shared/dataConfig'
import {
  columnDefs,
  gridTheme,
  orderedColumns,
  registerGridModules,
  toFilters,
  toRows,
  toSort,
  toTsv,
} from './grid'
import type { TableColumn, TableConfig } from './schema'

registerGridModules()

/**
 * Server-paged table (docs/components.md#table). Sort, column filters and column layout
 * are saved in the config by editors and kept for the session by viewers.
 */
const props = defineProps<ComponentViewProps<TableConfig>>()
const emit = defineEmits<{ 'update-config': [patch: Partial<TableConfig>] }>()

const queryClient = useQueryClient()
const ui = useCanvasUiStore()

// Session state, seeded from the saved config (and following it, e.g. on undo).
const sort = ref(props.config.sort)
const filterModel = ref(props.config.filterModel)
const layout = ref(props.config.columns)
watch(
  () => props.config.sort,
  (v) => (sort.value = v),
)
watch(
  () => props.config.filterModel,
  (v) => (filterModel.value = v),
)
watch(
  () => props.config.columns,
  (v) => (layout.value = v),
)

function persist(patch: Partial<TableConfig>): void {
  if (props.editable) emit('update-config', patch)
}

const filters = computed(() => toFilters(filterModel.value))

function tableShape(offset: number, limit: number): Extract<Shape, { kind: 'table' }> {
  return { kind: 'table', offset, limit, sort: sort.value, filters: filters.value }
}

// The first block drives the shared states, data age and query details.
const query = useComponentQuery({
  componentId: computed(() => props.component.id),
  dataset: computed(() => props.config.dataset),
  params: computed(() => props.config.params),
  shape: computed(() => tableShape(0, props.config.pageSize)),
  refreshSec: computed(() => refreshSeconds(props.config.refresh)),
})

const datasetColumns = computed(() => query.dataset.value?.columns ?? [])
const columns = computed(() => orderedColumns(datasetColumns.value, layout.value))

function format(value: unknown, type: ColumnType): string {
  if (value === null || value === undefined) return ''
  if (type === 'datetime' && typeof value === 'string') {
    return new Date(value).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
  }
  if (type === 'float' && typeof value === 'number') {
    return value.toLocaleString(undefined, { maximumFractionDigits: props.config.decimals })
  }
  if (type === 'bool') return value ? '✓' : ''
  return String(value)
}

const defs = computed(() =>
  columnDefs(datasetColumns.value, columns.value, format).map((def) => {
    const index = sort.value.findIndex((s) => s.column === def.colId)
    return index >= 0 ? { ...def, sort: sort.value[index]!.dir, sortIndex: index } : def
  }),
)

const rowSelection = computed<RowSelectionOptions | undefined>(() => {
  if (props.config.selection === 'none') return undefined
  return props.config.selection === 'single'
    ? { mode: 'singleRow', checkboxes: false, enableClickSelection: true }
    : { mode: 'multiRow', checkboxes: true, headerCheckbox: false, enableClickSelection: true }
})

const theme = computed(() => gridTheme(isDark.value))

// ---------------------------------------------------------------------------
// Grid and paging
// ---------------------------------------------------------------------------

const api = shallowRef<GridApi | null>(null)
const selectedCount = ref(0)

const datasource: IDatasource = {
  getRows: async (block) => {
    const request = query.request.value
    if (!request) {
      block.successCallback([], 0)
      return
    }
    const shape: Shape = {
      kind: 'table',
      offset: block.startRow,
      limit: block.endRow - block.startRow,
      sort: toSort(block.sortModel),
      filters: toFilters(block.filterModel as Record<string, unknown>),
    }
    try {
      // Same cache key as useComponentQuery, so the first block is usually already there.
      const result = await queryClient.fetchQuery<QueryResult>({
        queryKey: ['query', request.dataset, request.params, shape],
        queryFn: ({ signal }) => postQuery({ ...request, shape }, signal),
        staleTime: 60_000,
      })
      const rows = toRows(result.data)
      block.successCallback(rows, result.meta.totalRows ?? block.startRow + rows.length)
    } catch {
      block.failCallback()
    }
  },
}

function onGridReady(event: GridReadyEvent): void {
  api.value = event.api
  if (Object.keys(filterModel.value).length) event.api.setFilterModel(filterModel.value)
  event.api.setGridOption('datasource', datasource)
}

// New params or a refresh: drop loaded blocks and start over.
watch(
  () => JSON.stringify([query.request.value?.dataset, query.request.value?.params]),
  () => {
    if (api.value && !api.value.isDestroyed()) api.value.purgeInfiniteCache()
  },
)
watch(
  () => query.result.value?.meta.asOf,
  (asOf, previous) => {
    if (previous && asOf !== previous && api.value && !api.value.isDestroyed()) {
      api.value.purgeInfiniteCache()
    }
  },
)

function columnLayout(state: ColumnState[]): TableColumn[] {
  return state
    .filter((c) => c.colId !== 'ag-Grid-SelectionColumn')
    .map((c) => ({
      name: c.colId,
      visible: !c.hide,
      width: c.width ?? undefined,
      pinned: (c.pinned as 'left' | 'right' | null) ?? null,
    }))
}

function onSortChanged(): void {
  if (!api.value) return
  const next = api.value
    .getColumnState()
    .filter((c) => c.sort)
    .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
    .map((c) => ({ column: c.colId, dir: c.sort! }))
  sort.value = next
  persist({ sort: next })
}

function onFilterChanged(): void {
  if (!api.value) return
  const next = api.value.getFilterModel() as Record<string, unknown>
  filterModel.value = next
  persist({ filterModel: next })
}

function onLayoutChanged(event: { finished?: boolean; source?: string }): void {
  if (!api.value || event.finished === false || event.source === 'api') return
  const next = columnLayout(api.value.getColumnState())
  layout.value = next
  persist({ columns: next })
}

function onSelectionChanged(): void {
  if (!api.value) return
  const rows = api.value.getSelectedRows() as Record<string, unknown>[]
  selectedCount.value = rows.length
  ui.setRowSelection(props.component.id, rows)
}

/** Ctrl/⌘+C in the grid copies the selected rows (or the focused row) as TSV. */
function onKeydown(key: KeyboardEvent): void {
  if (!(key.ctrlKey || key.metaKey) || key.key.toLowerCase() !== 'c' || !api.value) return
  const selected = api.value.getSelectedRows() as Record<string, unknown>[]
  const focused = api.value.getFocusedCell()
  const focusedRow = focused && api.value.getDisplayedRowAtIndex(focused.rowIndex)?.data
  const rows = selected.length
    ? selected
    : focusedRow
      ? [focusedRow as Record<string, unknown>]
      : []
  if (!rows.length) return
  const visible = columns.value
    .filter((c) => c.visible)
    .map((c) => ({
      name: c.name,
      label: datasetColumns.value.find((d) => d.name === c.name)?.label ?? c.name,
    }))
  void navigator.clipboard?.writeText(toTsv(rows, visible))
  key.preventDefault()
}

onBeforeUnmount(() => ui.setRowSelection(props.component.id, []))

// With active column filters an empty result still shows the grid (to change the filters).
const displayState = computed(() =>
  query.state.value === 'empty' && filters.value.length ? 'ready' : query.state.value,
)
const totalRows = computed(() => query.result.value?.meta.totalRows ?? 0)
</script>

<template>
  <DataStateView
    :state="displayState"
    :error="query.error.value"
    :missing="query.missing.value"
    :params="query.params.value"
    @retry="query.retry"
  >
    <div class="table">
      <div
        class="table__grid"
        :class="{ nowheel: active }"
        data-own-keyboard
        data-testid="table-grid"
        @keydown="onKeydown"
      >
        <AgGridVue
          class="table__ag"
          :theme="theme"
          :column-defs="defs"
          row-model-type="infinite"
          :cache-block-size="config.pageSize"
          :max-blocks-in-cache="20"
          :row-selection="rowSelection"
          :suppress-cell-focus="false"
          :tooltip-show-delay="600"
          @grid-ready="onGridReady"
          @sort-changed="onSortChanged"
          @filter-changed="onFilterChanged"
          @column-moved="onLayoutChanged"
          @column-resized="onLayoutChanged"
          @column-pinned="onLayoutChanged"
          @column-visible="onLayoutChanged"
          @selection-changed="onSelectionChanged"
        />
      </div>
      <footer class="table__footer" data-testid="table-footer">
        <span>{{ totalRows.toLocaleString() }} rows</span>
        <span v-if="selectedCount" data-testid="table-selected"
          >· {{ selectedCount }} selected</span
        >
        <span v-if="filters.length" class="table__filtered">· filtered</span>
      </footer>
    </div>
  </DataStateView>
</template>

<style scoped>
.table {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.table__grid {
  flex: 1;
  min-height: 0;
}

.table__ag {
  width: 100%;
  height: 100%;
}

.table__footer {
  display: flex;
  gap: 4px;
  padding: 2px 8px;
  border-top: 1px solid var(--app-border);
  font-size: 11px;
  color: var(--app-text-muted);
  flex-shrink: 0;
}

.table__filtered {
  color: var(--app-primary);
}
</style>
