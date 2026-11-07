import { describe, expect, it } from 'vitest'
import type { DatasetColumn } from '@/api/types'
import {
  columnDefs,
  orderedColumns,
  toFilters,
  toRows,
  toSort,
  toTsv,
} from '@/components/table/grid'

const dataset: DatasetColumn[] = [
  { name: 'lot_id', type: 'string', label: 'Lot' },
  { name: 'yield_pct', type: 'float', label: 'Yield %' },
  { name: 'release_ts', type: 'datetime', label: 'Released' },
]

describe('table grid helpers', () => {
  it('keeps the saved column layout and appends new dataset columns', () => {
    const layout = orderedColumns(dataset, [
      { name: 'yield_pct', visible: false, width: 80 },
      { name: 'gone', visible: true },
    ])
    expect(layout).toEqual([
      { name: 'yield_pct', visible: false, width: 80 },
      { name: 'lot_id', visible: true },
      { name: 'release_ts', visible: true },
    ])
  })

  it('builds column defs with the right filters and formatting', () => {
    const defs = columnDefs(dataset, orderedColumns(dataset, []), (v) => `<${String(v)}>`)
    expect(defs.map((d) => [d.colId, d.filter, d.type])).toEqual([
      ['lot_id', 'agTextColumnFilter', undefined],
      ['yield_pct', 'agNumberColumnFilter', 'rightAligned'],
      ['release_ts', 'agDateColumnFilter', undefined],
    ])
    expect(defs.map((d) => d.width)).toEqual([120, 96, 140])
  })

  it('maps AG Grid sort and filter models to the table shape', () => {
    expect(toSort([{ colId: 'yield_pct', sort: 'desc' }])).toEqual([
      { column: 'yield_pct', dir: 'desc' },
    ])
    expect(
      toFilters({
        lot_id: { filterType: 'text', type: 'startsWith', filter: 'A0' },
        yield_pct: { filterType: 'number', type: 'inRange', filter: 80, filterTo: 90 },
        priority: { filterType: 'number', type: 'greaterThan', filter: 1 },
        release_ts: { filterType: 'date', type: 'lessThan', dateFrom: '2026-11-01 00:00:00' },
        empty: { filterType: 'text', type: 'contains', filter: '' },
      }),
    ).toEqual([
      { column: 'lot_id', op: 'startsWith', value: 'A0' },
      { column: 'yield_pct', op: 'gte', value: 80 },
      { column: 'yield_pct', op: 'lte', value: 90 },
      { column: 'priority', op: 'gt', value: 1 },
      { column: 'release_ts', op: 'lt', value: new Date('2026-11-01T00:00:00').toISOString() },
    ])
  })

  it('converts columnar data to rows and rows to TSV', () => {
    const rows = toRows({ lot_id: ['A1', 'B2'], yield_pct: [91.5, null] })
    expect(rows).toEqual([
      { lot_id: 'A1', yield_pct: 91.5 },
      { lot_id: 'B2', yield_pct: null },
    ])
    expect(
      toTsv(rows, [
        { name: 'lot_id', label: 'Lot' },
        { name: 'yield_pct', label: 'Yield\t%' },
      ]),
    ).toBe('Lot\tYield %\nA1\t91.5\nB2\t')
  })
})
