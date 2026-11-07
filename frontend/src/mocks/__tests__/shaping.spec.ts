import { describe, expect, it } from 'vitest'
import { lttb, shapeRows, type ColumnDef, type Row } from '@/mocks/shaping'

const cols = (...names: string[]): ColumnDef[] => names.map((name) => ({ name, type: 'unknown' }))

describe('lttb', () => {
  it('keeps the endpoints, the requested count and spikes', () => {
    const xs = Array.from({ length: 1000 }, (_, i) => i)
    const ys = xs.map((x) => (x === 500 ? 100 : Math.sin(x / 50)))
    const kept = lttb(xs, ys, 50)
    expect(kept).toHaveLength(50)
    expect(kept[0]).toBe(0)
    expect(kept[kept.length - 1]).toBe(999)
    expect(kept).toContain(500)
  })

  it('returns everything when below the threshold', () => {
    expect(lttb([1, 2, 3], [1, 2, 3], 10)).toEqual([0, 1, 2])
  })
})

describe('shapeRows', () => {
  const rows: Row[] = [
    { lot: 'A1', tool: 'ET-01', value: 3, ts: '2026-11-01T00:00:00Z' },
    { lot: 'A2', tool: 'ET-02', value: 1, ts: '2026-11-02T00:00:00Z' },
    { lot: 'B1', tool: 'ET-01', value: 2, ts: '2026-11-03T00:00:00Z' },
    { lot: 'B2', tool: 'ET-03', value: 10, ts: '2026-11-04T00:00:00Z' },
  ]

  it('table: filters, sorts, pages and reports the filtered total', () => {
    const shaped = shapeRows(rows, cols('lot', 'value'), {
      kind: 'table',
      offset: 1,
      limit: 1,
      sort: [{ column: 'value', dir: 'desc' }],
      filters: [{ column: 'tool', op: 'in', value: ['ET-01', 'ET-03'] }],
    })
    expect(shaped.data).toEqual({ lot: ['A1'], value: [3] })
    expect(shaped.meta.totalRows).toBe(3)
  })

  it('table: text and numeric operators', () => {
    const contains = shapeRows(rows, cols('lot'), {
      kind: 'table',
      offset: 0,
      limit: 10,
      filters: [{ column: 'lot', op: 'startsWith', value: 'b' }],
    })
    expect(contains.data.lot).toEqual(['B1', 'B2'])
    const gte = shapeRows(rows, cols('lot'), {
      kind: 'table',
      offset: 0,
      limit: 10,
      filters: [{ column: 'value', op: 'gte', value: 3 }],
    })
    expect(gte.data.lot).toEqual(['A1', 'B2'])
  })

  it('timeseries: downsamples per series and returns rows sorted by x', () => {
    const many: Row[] = Array.from({ length: 400 }, (_, i) => ({
      ts: new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString(),
      value: i % 7,
      chamber: i % 2 ? 'A' : 'B',
    }))
    const shaped = shapeRows(many, cols('ts', 'value', 'chamber'), {
      kind: 'timeseries',
      x: 'ts',
      y: ['value'],
      seriesBy: 'chamber',
      targetPoints: 40,
    })
    expect(shaped.data.ts).toHaveLength(40)
    expect(shaped.meta.downsampled).toBe(true)
    const ts = shaped.data.ts as string[]
    expect([...ts].sort()).toEqual(ts)
    expect(new Set(shaped.data.chamber)).toEqual(new Set(['A', 'B']))
  })

  it('histogram: counts add up per group', () => {
    const shaped = shapeRows(rows, [], {
      kind: 'histogram',
      column: 'value',
      bins: 3,
      groupBy: 'tool',
    })
    const counts = shaped.data.count as number[]
    expect(counts.reduce((a, b) => a + b, 0)).toBe(4)
    expect(shaped.meta.edges).toEqual([1, 4, 7, 10])
  })

  it('boxplot: quartiles and outliers per group', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 100].map((value) => ({ value, g: 'x' }))
    const shaped = shapeRows(values, [], { kind: 'boxplot', value: 'value', groupBy: 'g' })
    expect(shaped.data.median).toEqual([5.5])
    expect(shaped.data.max).toEqual([9])
    expect(shaped.data.outliers).toEqual([[100]])
  })

  it('wafer: aggregates per die, per wafer or stacked', () => {
    const dies: Row[] = [
      { wafer_id: 'W1', x: 0, y: 0, v: 1 },
      { wafer_id: 'W1', x: 0, y: 0, v: 3 },
      { wafer_id: 'W2', x: 0, y: 0, v: 10 },
      { wafer_id: 'W2', x: 1, y: 0, v: 20 },
    ]
    const gallery = shapeRows(dies, [], {
      kind: 'wafer',
      x: 'x',
      y: 'y',
      value: 'v',
      mode: 'gallery',
      aggregate: 'mean',
    })
    expect(gallery.data.value).toEqual([2, 10, 20])
    expect(gallery.meta.wafers).toEqual(['W1', 'W2'])
    const stacked = shapeRows(dies, [], {
      kind: 'wafer',
      x: 'x',
      y: 'y',
      value: 'v',
      mode: 'stacked',
      aggregate: 'max',
    })
    expect(stacked.data.value).toEqual([10, 20])
    const single = shapeRows(dies, [], {
      kind: 'wafer',
      x: 'x',
      y: 'y',
      value: 'v',
      mode: 'single',
      aggregate: 'mean',
      wafers: ['W2'],
    })
    expect(single.data.wafer_id).toEqual(['W2', 'W2'])
    expect(single.meta.xRange).toEqual([0, 1])
  })

  it('distinct: unique, searched, sorted and limited', () => {
    const shaped = shapeRows(rows, [], {
      kind: 'distinct',
      column: 'tool',
      search: 'et-0',
      limit: 2,
    })
    expect(shaped.data.value).toEqual(['ET-01', 'ET-02'])
    expect(shaped.meta.downsampled).toBe(true)
  })
})
