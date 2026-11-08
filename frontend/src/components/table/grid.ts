import {
  CellStyleModule,
  ColumnApiModule,
  DateFilterModule,
  InfiniteRowModelModule,
  ModuleRegistry,
  NumberFilterModule,
  RowApiModule,
  RowSelectionModule,
  TextFilterModule,
  TooltipModule,
  colorSchemeDark,
  colorSchemeLight,
  themeQuartz,
  type ColDef,
  type SortModelItem,
} from 'ag-grid-community'
import type { ColumnFilter, DatasetColumn, Shape } from '@/api/types'
import type { TableColumn } from './schema'

let registered = false

/** Register only the AG Grid Community modules the table uses (keeps the bundle smaller). */
export function registerGridModules(): void {
  if (registered) return
  registered = true
  ModuleRegistry.registerModules([
    InfiniteRowModelModule,
    RowSelectionModule,
    TextFilterModule,
    NumberFilterModule,
    DateFilterModule,
    ColumnApiModule,
    RowApiModule,
    CellStyleModule,
    TooltipModule,
  ])
}

/** The AG Grid theme, following the app's design tokens and color scheme. */
export function gridTheme(dark: boolean) {
  return themeQuartz.withPart(dark ? colorSchemeDark : colorSchemeLight).withParams({
    fontFamily: 'inherit',
    fontSize: 12,
    headerFontSize: 12,
    rowHeight: 28,
    headerHeight: 30,
    spacing: 4,
    wrapperBorder: false,
    wrapperBorderRadius: 0,
    accentColor: dark ? '#818cf8' : '#4f46e5',
    backgroundColor: dark ? '#18181c' : '#ffffff',
    headerBackgroundColor: dark ? '#101014' : '#f8fafc',
    borderColor: dark ? '#3f3f46' : '#e2e8f0',
  })
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

export { orderedColumns } from './columns'

export function columnDefs(
  dataset: DatasetColumn[],
  layout: TableColumn[],
  format: (value: unknown, type: DatasetColumn['type']) => string,
): ColDef[] {
  const byName = new Map(dataset.map((c) => [c.name, c]))
  return layout.map((column) => {
    const def = byName.get(column.name)!
    const numeric = def.type === 'int' || def.type === 'float'
    return {
      colId: def.name,
      field: def.name,
      headerName: def.label ?? def.name,
      hide: !column.visible,
      // Saved width, else a compact default by type.
      width: column.width ?? (numeric ? 96 : def.type === 'datetime' ? 140 : 120),
      pinned: column.pinned ?? null,
      sortable: true,
      resizable: true,
      filter: numeric
        ? 'agNumberColumnFilter'
        : def.type === 'datetime'
          ? 'agDateColumnFilter'
          : 'agTextColumnFilter',
      filterParams: { maxNumConditions: 1, buttons: ['reset'] },
      type: numeric ? 'rightAligned' : undefined,
      valueFormatter: (params) => format(params.value, def.type),
      tooltipValueGetter: (params) => format(params.value, def.type),
    } satisfies ColDef
  })
}

// ---------------------------------------------------------------------------
// Sort and filter → table shape (docs/api.md#post-apiquery)
// ---------------------------------------------------------------------------

export function toSort(
  model: SortModelItem[],
): NonNullable<Extract<Shape, { kind: 'table' }>['sort']> {
  return model.map((item) => ({ column: item.colId, dir: item.sort }))
}

const TEXT_OPS: Record<string, ColumnFilter['op']> = {
  contains: 'contains',
  equals: 'equals',
  notEqual: 'notEquals',
  startsWith: 'startsWith',
}

const COMPARE_OPS: Record<string, ColumnFilter['op']> = {
  equals: 'equals',
  notEqual: 'notEquals',
  greaterThan: 'gt',
  greaterThanOrEqual: 'gte',
  lessThan: 'lt',
  lessThanOrEqual: 'lte',
}

interface AgFilter {
  filterType?: string
  type?: string
  filter?: unknown
  filterTo?: unknown
  dateFrom?: string | null
  dateTo?: string | null
}

/** AG Grid filter model → shape filters. Unsupported conditions are dropped. */
export function toFilters(model: Record<string, unknown>): ColumnFilter[] {
  const filters: ColumnFilter[] = []
  for (const [column, raw] of Object.entries(model)) {
    const f = raw as AgFilter
    if (!f?.type) continue
    if (f.filterType === 'text') {
      const op = TEXT_OPS[f.type]
      if (op && f.filter !== undefined && f.filter !== '')
        filters.push({ column, op, value: f.filter })
      continue
    }
    const isDate = f.filterType === 'date'
    const from = isDate
      ? f.dateFrom && new Date(f.dateFrom.replace(' ', 'T')).toISOString()
      : f.filter
    const to = isDate ? f.dateTo && new Date(f.dateTo.replace(' ', 'T')).toISOString() : f.filterTo
    if (f.type === 'inRange') {
      if (from !== undefined && from !== null) filters.push({ column, op: 'gte', value: from })
      if (to !== undefined && to !== null) filters.push({ column, op: 'lte', value: to })
      continue
    }
    const op = COMPARE_OPS[f.type]
    if (op && from !== undefined && from !== null) filters.push({ column, op, value: from })
  }
  return filters
}

/** Rows (objects) from a columnar result. */
export function toRows(data: Record<string, unknown[]>): Record<string, unknown>[] {
  const names = Object.keys(data)
  const length = data[names[0] ?? '']?.length ?? 0
  return Array.from({ length }, (_, i) => Object.fromEntries(names.map((n) => [n, data[n]![i]])))
}

/** Tab-separated text for pasting into Excel. */
export function toTsv(
  rows: Record<string, unknown>[],
  columns: { name: string; label: string }[],
): string {
  const clean = (v: unknown) =>
    v === null || v === undefined ? '' : String(v).replace(/[\t\n\r]/g, ' ')
  return [
    columns.map((c) => clean(c.label)).join('\t'),
    ...rows.map((row) => columns.map((c) => clean(row[c.name])).join('\t')),
  ].join('\n')
}
