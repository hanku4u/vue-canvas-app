import type { EChartsOption, SeriesOption } from 'echarts'
import type { ColumnType, QueryResult } from '@/api/types'
import { STATUS, type ChartTokens, type ColorSlots } from '@/ui/vizPalette'
import type { ChartFields } from './fields'
import type { ChartKind } from './schema'

/**
 * ECharts options for each chart kind (docs/components.md#chart), as pure functions of the
 * query result. Marks follow the dataviz rules: thin lines, recessive axes, categorical
 * colors that follow the entity, a legend for two or more series, limits labeled directly,
 * and out-of-control points marked with the reserved critical color *and* a diamond shape
 * plus a count badge (never color alone).
 */

export interface BuildContext {
  kind: ChartKind
  fields: ChartFields
  tokens: ChartTokens
  colors: ColorSlots
  /** Column labels for axes and tooltips. */
  labels: Map<string, string>
  types: Map<string, ColumnType | 'unknown'>
  tooltipColumns: string[]
  yLog: boolean
  legend: boolean
}

export interface BuiltChart {
  option: EChartsOption
  /** Out-of-control points (SPC only). */
  ooc: number
  seriesNames: string[]
}

type Row = Record<string, unknown>

function rowCount(result: QueryResult): number {
  return Object.values(result.data)[0]?.length ?? 0
}

function rowAt(result: QueryResult, i: number): Row {
  return Object.fromEntries(Object.entries(result.data).map(([k, v]) => [k, v[i]]))
}

function escape(value: unknown): string {
  return String(value ?? '').replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)
}

export function formatValue(value: unknown, type: ColumnType | 'unknown' | undefined): string {
  if (value === null || value === undefined || value === '') return '–'
  if (type === 'datetime') {
    const ms = typeof value === 'number' ? value : Date.parse(String(value))
    return new Date(ms).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
  }
  if (typeof value === 'number')
    return value.toLocaleString(undefined, { maximumFractionDigits: 4 })
  return String(value)
}

function numeric(value: unknown, type?: ColumnType | 'unknown'): number {
  if (typeof value === 'number') return value
  if (type === 'datetime' || (typeof value === 'string' && /^\d{4}-\d\d-\d\d/.test(value))) {
    return Date.parse(String(value))
  }
  return Number(value)
}

function axisStyle(tokens: ChartTokens) {
  return {
    axisLine: { lineStyle: { color: tokens.axis } },
    axisTick: { show: false },
    axisLabel: { color: tokens.textMuted, fontSize: 11, hideOverlap: true },
    splitLine: { lineStyle: { color: tokens.grid } },
    nameTextStyle: { color: tokens.textMuted, fontSize: 11 },
  }
}

function baseOption(ctx: BuildContext, legendNames: string[]): EChartsOption {
  const showLegend = ctx.legend && legendNames.length >= 2
  return {
    animation: false,
    backgroundColor: 'transparent',
    textStyle: { fontFamily: 'inherit', color: ctx.tokens.text },
    // Top row is reserved for the component's badges (OOC count, downsampling, zoom).
    grid: { left: 8, right: 56, top: 32, bottom: showLegend ? 30 : 8, containLabel: true },
    legend: showLegend
      ? {
          data: legendNames,
          bottom: 4,
          left: 8,
          type: 'scroll',
          itemWidth: 14,
          itemHeight: 8,
          textStyle: { color: ctx.tokens.text, fontSize: 11 },
          pageTextStyle: { color: ctx.tokens.textMuted },
        }
      : { show: false },
    tooltip: {
      trigger: 'item',
      confine: true,
      backgroundColor: ctx.tokens.surface,
      borderColor: ctx.tokens.axis,
      textStyle: { color: ctx.tokens.text, fontSize: 12 },
    },
  }
}

/** Tooltip for one data row: series, x, y and the dataset's tooltip columns. */
function rowTooltip(ctx: BuildContext, result: QueryResult, series: string, index: number): string {
  const row = rowAt(result, index)
  const { x, y } = ctx.fields
  const lines = [
    series ? `<strong>${escape(series)}</strong>` : '',
    `${escape(ctx.labels.get(x) ?? x)}: ${escape(formatValue(row[x], ctx.types.get(x)))}`,
    `${escape(ctx.labels.get(y[0]!) ?? y[0])}: <strong>${escape(formatValue(row[y[0]!], 'float'))}</strong>`,
    ...ctx.tooltipColumns
      .filter((c) => c !== x && c !== y[0] && c in row)
      .map(
        (c) =>
          `${escape(ctx.labels.get(c) ?? c)}: ${escape(formatValue(row[c], ctx.types.get(c)))}`,
      ),
  ]
  return lines.filter(Boolean).join('<br>')
}

function groups(result: QueryResult, by: string): Map<string, number[]> {
  const out = new Map<string, number[]>()
  const values = by ? result.data[by] : undefined
  const n = rowCount(result)
  for (let i = 0; i < n; i += 1) {
    const key = values ? String(values[i] ?? '–') : ''
    const list = out.get(key)
    if (list) list.push(i)
    else out.set(key, [i])
  }
  return out
}

function sortedKeys(map: Map<string, unknown>): string[] {
  return [...map.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

// ---------------------------------------------------------------------------
// Trend and SPC
// ---------------------------------------------------------------------------

const LIMIT_STYLE: Record<string, { label: string; type: 'dashed' | 'dotted' | 'solid' }> = {
  ucl: { label: 'UCL', type: 'dashed' },
  lcl: { label: 'LCL', type: 'dashed' },
  target: { label: 'Target', type: 'solid' },
  usl: { label: 'USL', type: 'dotted' },
  lsl: { label: 'LSL', type: 'dotted' },
}

/** Step-line points for a limit column: only where the value changes, plus the last x. */
function limitSteps(xs: number[], values: unknown[], order: number[]): [number, number][] {
  const points: [number, number][] = []
  let last: number | undefined
  for (const i of order) {
    const v = Number(values[i])
    if (!Number.isFinite(v)) continue
    if (v !== last) points.push([xs[i]!, v])
    last = v
  }
  const end = order[order.length - 1]
  if (end !== undefined && points.length && last !== undefined) points.push([xs[end]!, last])
  return points
}

function buildTimeseries(result: QueryResult, ctx: BuildContext): BuiltChart {
  const { fields, tokens, colors, kind } = ctx
  const n = rowCount(result)
  const xType = ctx.types.get(fields.x)
  const xs = (result.data[fields.x] ?? []).map((v) => numeric(v, xType))
  const yName = fields.y[0]!
  const series: SeriesOption[] = []
  const legendNames: string[] = []

  // One series per group (seriesBy) — or, for a trend without seriesBy, per y column.
  const byGroup = groups(result, fields.seriesBy)
  const keys = sortedKeys(byGroup)
  colors.assign(keys)
  const multiY = kind === 'line' && !fields.seriesBy && fields.y.length > 1
  // `key` is what the color slot follows: the group value, or the y column.
  const lines = multiY
    ? fields.y.map((column) => ({
        key: column,
        name: ctx.labels.get(column) ?? column,
        column,
        rows: byGroup.get('') ?? [],
      }))
    : keys.map((key) => ({
        key,
        // "Chamber C" rather than a bare "C".
        name: key
          ? `${ctx.labels.get(fields.seriesBy) ?? fields.seriesBy} ${key}`
          : (ctx.labels.get(yName) ?? yName),
        column: yName,
        rows: byGroup.get(key)!,
      }))
  if (multiY) colors.assign(lines.map((l) => l.key))

  for (const line of lines) {
    const values = result.data[line.column] ?? []
    legendNames.push(line.name)
    series.push({
      name: line.name,
      type: 'line',
      showSymbol: kind === 'spc',
      symbol: 'circle',
      symbolSize: 4,
      // SPC: points carry the data; the connecting line stays faint.
      lineStyle: kind === 'spc' ? { width: 1, opacity: 0.35 } : { width: 2 },
      color: tokens.categorical[colors.slot(line.key)],
      connectNulls: true,
      large: true,
      data: line.rows.map((i) => [xs[i], numeric(values[i]), i]),
      tooltip: {
        formatter: (p) => rowTooltip(ctx, result, line.name, (p.data as number[])[2]!),
      },
    } as SeriesOption)
  }

  let ooc = 0
  if (kind === 'spc') {
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => xs[a]! - xs[b]!)
    for (const [key, style] of Object.entries(LIMIT_STYLE)) {
      const column = fields.limits[key as keyof ChartFields['limits']]
      if (!column || !result.data[column]) continue
      series.push({
        name: style.label,
        type: 'line',
        step: 'end',
        symbol: 'none',
        silent: true,
        z: 1,
        lineStyle: { color: tokens.textMuted, width: 1, type: style.type },
        endLabel: { show: true, formatter: style.label, color: tokens.textMuted, fontSize: 10 },
        tooltip: { show: false },
        data: limitSteps(xs, result.data[column]!, order),
      } as SeriesOption)
    }
    const ucl = fields.limits.ucl ? result.data[fields.limits.ucl] : undefined
    const lcl = fields.limits.lcl ? result.data[fields.limits.lcl] : undefined
    const values = result.data[yName] ?? []
    const out: [number, number, number][] = []
    for (let i = 0; i < n; i += 1) {
      const v = Number(values[i])
      const high = ucl && Number.isFinite(Number(ucl[i])) && v > Number(ucl[i])
      const low = lcl && Number.isFinite(Number(lcl[i])) && v < Number(lcl[i])
      if (high || low) out.push([xs[i]!, v, i])
    }
    ooc = out.length
    if (ooc) {
      legendNames.push('Out of control')
      series.push({
        name: 'Out of control',
        type: 'scatter',
        symbol: 'diamond',
        symbolSize: 10,
        z: 5,
        itemStyle: { color: STATUS.critical, borderColor: tokens.surface, borderWidth: 2 },
        data: out,
        tooltip: {
          formatter: (p) =>
            `<span style="color:${STATUS.critical}">◆ Out of control</span><br>` +
            rowTooltip(ctx, result, '', (p.data as number[])[2]!),
        },
      } as SeriesOption)
    }
  }

  const option: EChartsOption = {
    ...baseOption(ctx, legendNames),
    xAxis: {
      type: xType === 'datetime' ? 'time' : 'value',
      scale: true,
      ...axisStyle(tokens),
      splitLine: { show: false },
    },
    // No axis name: the component title says what's plotted (and a name would collide
    // with the legend); tooltips label every value.
    yAxis: { type: ctx.yLog ? 'log' : 'value', scale: true, ...axisStyle(tokens) },
    // The box-zoom cursor needs a rendered toolbox; it is placed off-screen and the
    // cursor is switched on programmatically while the chart is active.
    toolbox: {
      show: true,
      right: -1000,
      feature: { dataZoom: { yAxisIndex: 'none' } },
    },
    series,
  }
  return { option, ooc, seriesNames: legendNames }
}

// ---------------------------------------------------------------------------
// Scatter, histogram, box plot
// ---------------------------------------------------------------------------

function buildScatter(result: QueryResult, ctx: BuildContext): BuiltChart {
  const { fields, tokens, colors } = ctx
  const xType = ctx.types.get(fields.x)
  const xs = (result.data[fields.x] ?? []).map((v) => numeric(v, xType))
  const ys = (result.data[fields.y[0]!] ?? []).map((v) => numeric(v))
  const byGroup = groups(result, fields.seriesBy)
  const keys = sortedKeys(byGroup)
  colors.assign(keys)
  const series: SeriesOption[] = keys.map((key) => ({
    name: key || (ctx.labels.get(fields.y[0]!) ?? fields.y[0]),
    type: 'scatter',
    symbolSize: 6,
    large: true,
    color: tokens.categorical[colors.slot(key)],
    itemStyle: { opacity: 0.75 },
    data: byGroup.get(key)!.map((i) => [xs[i], ys[i], i]),
    tooltip: { formatter: (p) => rowTooltip(ctx, result, key, (p.data as number[])[2]!) },
  })) as SeriesOption[]
  const option: EChartsOption = {
    ...baseOption(ctx, keys.filter(Boolean)),
    xAxis: {
      type: xType === 'datetime' ? 'time' : 'value',
      scale: true,
      name: ctx.labels.get(fields.x) ?? fields.x,
      nameLocation: 'middle',
      nameGap: 24,
      ...axisStyle(tokens),
    },
    yAxis: {
      type: ctx.yLog ? 'log' : 'value',
      scale: true,
      name: ctx.labels.get(fields.y[0]!) ?? fields.y[0],
      ...axisStyle(tokens),
    },
    series,
  }
  return { option, ooc: 0, seriesNames: keys }
}

function buildHistogram(result: QueryResult, ctx: BuildContext): BuiltChart {
  const { tokens, colors, fields } = ctx
  const starts = result.data.bin_start ?? []
  const ends = result.data.bin_end ?? []
  const counts = result.data.count ?? []
  const groupCol = result.data.group ?? []
  const bins = [...new Set(starts.map(Number))].sort((a, b) => a - b)
  const binIndex = new Map(bins.map((b, i) => [b, i]))
  const binEnd = new Map(starts.map((s, i) => [Number(s), Number(ends[i])]))
  const keys = [...new Set(groupCol.map((g) => String(g ?? '')))].sort()
  colors.assign(keys)
  const fmt = (v: number) => v.toLocaleString(undefined, { maximumSignificantDigits: 4 })
  const series: SeriesOption[] = keys.map((key) => {
    const data = bins.map(() => 0)
    starts.forEach((s, i) => {
      if (String(groupCol[i] ?? '') === key) data[binIndex.get(Number(s))!] = Number(counts[i])
    })
    return {
      name: key || 'Count',
      type: 'bar',
      color: tokens.categorical[colors.slot(key)],
      barGap: '0%',
      barCategoryGap: '8%',
      itemStyle: { borderRadius: [2, 2, 0, 0] },
      data,
      tooltip: {
        formatter: (p) => {
          const b = bins[p.dataIndex]!
          return `${key ? `<strong>${escape(key)}</strong><br>` : ''}${fmt(b)} – ${fmt(binEnd.get(b)!)}: <strong>${String(p.value)}</strong>`
        },
      },
    } as SeriesOption
  })
  const option: EChartsOption = {
    ...baseOption(ctx, keys.filter(Boolean)),
    xAxis: {
      type: 'category',
      data: bins.map(fmt),
      name: ctx.labels.get(fields.y[0]!) ?? fields.y[0],
      nameLocation: 'middle',
      nameGap: 24,
      ...axisStyle(tokens),
      splitLine: { show: false },
    },
    yAxis: { type: ctx.yLog ? 'log' : 'value', name: 'Count', ...axisStyle(tokens) },
    series,
  }
  return { option, ooc: 0, seriesNames: keys }
}

function buildBoxplot(result: QueryResult, ctx: BuildContext): BuiltChart {
  const { tokens, fields } = ctx
  const categories = (result.data.group ?? []).map(String)
  const n = categories.length
  const stats = Array.from({ length: n }, (_, i) =>
    ['min', 'q1', 'median', 'q3', 'max'].map((k) => Number(result.data[k]?.[i])),
  )
  const outliers: [number, number][] = []
  ;(result.data.outliers ?? []).forEach((list, i) => {
    for (const v of (list as number[]) ?? []) outliers.push([i, v])
  })
  const color = tokens.categorical[0]
  const option: EChartsOption = {
    ...baseOption(ctx, []),
    xAxis: {
      type: 'category',
      data: categories,
      name: ctx.labels.get(fields.groupBy) ?? fields.groupBy,
      nameLocation: 'middle',
      nameGap: 24,
      ...axisStyle(tokens),
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      scale: true,
      name: ctx.labels.get(fields.y[0]!) ?? fields.y[0],
      ...axisStyle(tokens),
    },
    series: [
      {
        name: ctx.labels.get(fields.y[0]!) ?? fields.y[0],
        type: 'boxplot',
        itemStyle: { color: `${color}33`, borderColor: color, borderWidth: 1.5 },
        data: stats,
        tooltip: {
          formatter: (p) => {
            const i = p.dataIndex
            const fmt = (k: string) => formatValue(result.data[k]?.[i], 'float')
            return [
              `<strong>${escape(categories[i])}</strong> (n = ${String(result.data.count?.[i] ?? '')})`,
              `max ${fmt('max')} · q3 ${fmt('q3')}`,
              `median <strong>${fmt('median')}</strong> · mean ${fmt('mean')}`,
              `q1 ${fmt('q1')} · min ${fmt('min')}`,
            ].join('<br>')
          },
        },
      },
      {
        name: 'Outliers',
        type: 'scatter',
        symbolSize: 6,
        itemStyle: { color: tokens.textMuted },
        data: outliers,
        tooltip: { formatter: (p) => `Outlier: ${formatValue((p.data as number[])[1], 'float')}` },
      },
    ],
  }
  return { option, ooc: 0, seriesNames: [] }
}

export function buildChart(result: QueryResult, ctx: BuildContext): BuiltChart {
  switch (ctx.kind) {
    case 'line':
    case 'spc':
      return buildTimeseries(result, ctx)
    case 'scatter':
      return buildScatter(result, ctx)
    case 'histogram':
      return buildHistogram(result, ctx)
    case 'boxplot':
      return buildBoxplot(result, ctx)
  }
}
