import type { DatasetColumn, Shape } from '@/api/types'
import type { ChartConfig, ChartKind } from './schema'

/** Concrete columns a chart uses, after filling '' (auto) from the dataset. */
export interface ChartFields {
  x: string
  y: string[]
  seriesBy: string
  groupBy: string
  limits: { ucl: string; lcl: string; target: string; usl: string; lsl: string }
}

const isNumeric = (c: DatasetColumn) => c.type === 'int' || c.type === 'float'
const SERIES_PREFERENCE = ['chamber', 'tool_id', 'product', 'status', 'area']
const LIMIT_NAMES = ['ucl', 'lcl', 'target', 'usl', 'lsl'] as const

export function resolveChartFields(columns: DatasetColumn[], config: ChartConfig): ChartFields {
  const names = new Set(columns.map((c) => c.name))
  const has = (name: string) => !!name && names.has(name)
  const limitCols = new Set<string>(LIMIT_NAMES)

  const time = columns.find((c) => c.type === 'datetime')
  const numeric = columns.filter(isNumeric)
  const firstValue =
    numeric.find((c) => c.name === 'value') ??
    numeric.find((c) => !limitCols.has(c.name) && c.name !== 'slot' && c.name !== 'site') ??
    numeric[0]

  const x = has(config.x)
    ? config.x
    : config.kind === 'scatter'
      ? (numeric.find((c) => c.name !== firstValue?.name)?.name ?? time?.name ?? '')
      : (time?.name ?? numeric[0]?.name ?? '')
  const y = config.y.filter(has)
  const seriesBy = config.seriesBy === '-' ? '' : has(config.seriesBy) ? config.seriesBy : ''
  const autoSeries = SERIES_PREFERENCE.find((n) => names.has(n)) ?? ''

  const limits = Object.fromEntries(
    LIMIT_NAMES.map((name) => {
      const chosen = config.limits[name]
      if (chosen === '-') return [name, '']
      return [name, has(chosen) ? chosen : names.has(name) ? name : '']
    }),
  ) as ChartFields['limits']

  return {
    x,
    y: y.length ? y : firstValue ? [firstValue.name] : [],
    seriesBy: config.seriesBy === '' ? (config.kind === 'histogram' ? '' : autoSeries) : seriesBy,
    groupBy: has(config.groupBy) ? config.groupBy : autoSeries,
    limits,
  }
}

/** Point budget from the component's width (about two points per pixel), stepped to reuse queries. */
export function pointBudget(width: number): number {
  return Math.min(4000, Math.max(400, Math.ceil((width * 2) / 400) * 400))
}

export function chartShape(
  kind: ChartKind,
  fields: ChartFields,
  options: { width: number; bins: number; xRange: [string, string] | null },
): Shape | null {
  const y = fields.y[0]
  if (!y) return null
  switch (kind) {
    case 'line':
    case 'spc': {
      if (!fields.x) return null
      const limitCols =
        kind === 'spc' ? Object.values(fields.limits).filter((c): c is string => !!c) : []
      const ys = kind === 'spc' ? [y, ...limitCols] : fields.y
      return {
        kind: 'timeseries',
        x: fields.x,
        y: [...new Set(ys)],
        seriesBy: fields.seriesBy || undefined,
        targetPoints: pointBudget(options.width),
        ...(options.xRange ? { xRange: options.xRange } : {}),
      }
    }
    case 'scatter':
      if (!fields.x) return null
      return {
        kind: 'scatter',
        x: fields.x,
        y,
        colorBy: fields.seriesBy || undefined,
        maxPoints: pointBudget(options.width) * 2,
      }
    case 'histogram':
      return {
        kind: 'histogram',
        column: y,
        bins: options.bins || undefined,
        groupBy: fields.seriesBy || undefined,
      }
    case 'boxplot':
      return fields.groupBy ? { kind: 'boxplot', value: y, groupBy: fields.groupBy } : null
  }
}
