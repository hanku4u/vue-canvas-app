import { describe, expect, it } from 'vitest'
import type { DatasetColumn, QueryResult } from '@/api/types'
import { chartShape, pointBudget, resolveChartFields } from '@/components/chart/fields'
import { buildChart, type BuildContext } from '@/components/chart/options'
import { chartConfigSchema } from '@/components/chart/schema'
import { chartTokens, ColorSlots, STATUS } from '@/ui/vizPalette'

const columns: DatasetColumn[] = [
  { name: 'ts', type: 'datetime' },
  { name: 'value', type: 'float' },
  { name: 'ucl', type: 'float' },
  { name: 'lcl', type: 'float' },
  { name: 'target', type: 'float' },
  { name: 'chamber', type: 'string' },
  { name: 'slot', type: 'int' },
]

const config = (patch = {}) => chartConfigSchema.parse({ dataset: 'spc_points', ...patch })

describe('resolveChartFields', () => {
  it('picks time, value, a series split and limit columns automatically', () => {
    expect(resolveChartFields(columns, config({ kind: 'spc' }))).toEqual({
      x: 'ts',
      y: ['value'],
      seriesBy: 'chamber',
      groupBy: 'chamber',
      limits: { ucl: 'ucl', lcl: 'lcl', target: 'target', usl: '', lsl: '' },
    })
  })

  it('respects explicit choices and "none"', () => {
    const fields = resolveChartFields(
      columns,
      config({
        kind: 'line',
        y: ['ucl', 'value'],
        seriesBy: '-',
        limits: { ucl: '-', lcl: '', target: '', usl: '', lsl: '' },
      }),
    )
    expect(fields).toMatchObject({ y: ['ucl', 'value'], seriesBy: '', limits: { ucl: '' } })
  })
})

describe('chartShape', () => {
  const fields = resolveChartFields(columns, config({ kind: 'spc' }))

  it('asks for a downsampled time series with limits, sized to the component', () => {
    expect(pointBudget(640)).toBe(1600)
    expect(chartShape('spc', fields, { width: 640, bins: 0, xRange: null })).toEqual({
      kind: 'timeseries',
      x: 'ts',
      y: ['value', 'ucl', 'lcl', 'target'],
      seriesBy: 'chamber',
      targetPoints: 1600,
    })
  })

  it('includes a zoomed range and builds the other shapes', () => {
    const range: [string, string] = ['2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z']
    expect(chartShape('line', fields, { width: 400, bins: 0, xRange: range })).toMatchObject({
      xRange: range,
    })
    expect(chartShape('histogram', fields, { width: 400, bins: 30, xRange: null })).toEqual({
      kind: 'histogram',
      column: 'value',
      bins: 30,
      groupBy: 'chamber',
    })
    expect(chartShape('boxplot', fields, { width: 400, bins: 0, xRange: null })).toEqual({
      kind: 'boxplot',
      value: 'value',
      groupBy: 'chamber',
    })
  })
})

describe('buildChart', () => {
  const result: QueryResult = {
    columns: columns.map((c) => ({ name: c.name, type: c.type })),
    data: {
      ts: [
        '2026-11-01T00:00:00Z',
        '2026-11-01T01:00:00Z',
        '2026-11-01T02:00:00Z',
        '2026-11-01T03:00:00Z',
      ],
      value: [40, 42, 39, 36],
      ucl: [41, 41, 41, 40.5],
      lcl: [39, 39, 39, 39.5],
      target: [40, 40, 40, 40],
      chamber: ['A', 'C', 'A', 'C'],
      slot: [1, 2, 3, 4],
    },
    meta: {
      shape: 'timeseries',
      rowsUpstream: 4,
      rowsReturned: 4,
      downsampled: false,
      cacheHit: false,
      asOf: '',
      durationMs: 1,
      upstreamMs: 1,
    },
  }

  function ctx(patch: Partial<BuildContext> = {}): BuildContext {
    return {
      kind: 'spc',
      fields: resolveChartFields(columns, config({ kind: 'spc' })),
      tokens: chartTokens(false),
      colors: new ColorSlots(),
      labels: new Map([
        ['chamber', 'Chamber'],
        ['value', 'Value'],
      ]),
      types: new Map(columns.map((c) => [c.name, c.type])),
      tooltipColumns: ['chamber'],
      yLog: false,
      legend: true,
      ...patch,
    }
  }

  it('SPC: one series per chamber, step limits and out-of-control points', () => {
    const built = buildChart(result, ctx())
    const series = built.option.series as {
      name: string
      type: string
      data: unknown[]
      step?: string
      itemStyle?: { color?: string }
    }[]
    expect(series.map((s) => s.name)).toEqual([
      'Chamber A',
      'Chamber C',
      'UCL',
      'LCL',
      'Target',
      'Out of control',
    ])
    // 42 > 41 (UCL) and 36 < 39.5 (LCL)
    expect(built.ooc).toBe(2)
    const ooc = series.find((s) => s.name === 'Out of control')!
    expect(ooc.itemStyle?.color).toBe(STATUS.critical)
    // UCL changes once: steps at the start, at the change and at the end.
    const ucl = series.find((s) => s.name === 'UCL')!
    expect(ucl.step).toBe('end')
    expect(ucl.data).toHaveLength(3)
    expect(built.seriesNames).toContain('Out of control')
  })

  it('keeps series colors with their entity when a series disappears', () => {
    const colors = new ColorSlots()
    const first = buildChart(result, ctx({ colors }))
    const colorOf = (built: typeof first, name: string) =>
      (built.option.series as { name: string; color?: string }[]).find((s) => s.name === name)
        ?.color
    const cColor = colorOf(first, 'Chamber C')
    const onlyC: QueryResult = {
      ...result,
      data: Object.fromEntries(Object.entries(result.data).map(([k, v]) => [k, [v[1], v[3]]])),
    }
    const second = buildChart(onlyC, ctx({ colors }))
    expect(colorOf(second, 'Chamber C')).toBe(cColor)
  })

  it('shows a legend only for two or more series', () => {
    const single = buildChart(
      result,
      ctx({ kind: 'line', fields: { ...ctx().fields, seriesBy: '' } }),
    )
    expect((single.option.legend as { show?: boolean }).show).toBe(false)
  })

  it('histogram and boxplot', () => {
    const hist = buildChart(
      {
        ...result,
        data: {
          bin_start: [0, 1, 0, 1],
          bin_end: [1, 2, 1, 2],
          count: [3, 1, 2, 5],
          group: ['A', 'A', 'C', 'C'],
        },
      },
      ctx({ kind: 'histogram' }),
    )
    expect((hist.option.series as { data: number[] }[]).map((s) => s.data)).toEqual([
      [3, 1],
      [2, 5],
    ])

    const box = buildChart(
      {
        ...result,
        data: {
          group: ['A'],
          min: [1],
          q1: [2],
          median: [3],
          q3: [4],
          max: [5],
          mean: [3],
          count: [10],
          outliers: [[9]],
        },
      },
      ctx({ kind: 'boxplot' }),
    )
    const [boxes, outliers] = box.option.series as { data: unknown[] }[]
    expect(boxes!.data).toEqual([[1, 2, 3, 4, 5]])
    expect(outliers!.data).toEqual([[0, 9]])
  })
})
