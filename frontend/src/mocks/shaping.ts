import type { ColumnFilter, ColumnType, QueryMeta, Shape } from '@/api/types'

/**
 * Result shaping (docs/data-layer.md#shapes) for the MSW mock of /api/query. The real
 * backend does this in Polars; this TypeScript version keeps payloads small for the demo
 * and documents the expected behavior of each shape.
 */

export type Row = Record<string, unknown>

export interface ColumnDef {
  name: string
  type: ColumnType | 'unknown'
}

export interface Shaped {
  columns: ColumnDef[]
  data: Record<string, unknown[]>
  meta: Partial<QueryMeta> & { downsampled: boolean }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function toColumnar(rows: Row[], columns: ColumnDef[]): Record<string, unknown[]> {
  const data: Record<string, unknown[]> = {}
  for (const column of columns) data[column.name] = rows.map((row) => row[column.name] ?? null)
  return data
}

function num(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (/^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(parsed)) return parsed
    return Number(value)
  }
  return Number.NaN
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === null || a === undefined) return 1
  if (b === null || b === undefined) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true })
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return Number.NaN
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo)
}

function round(value: number, digits = 6): number {
  const f = 10 ** digits
  return Math.round(value * f) / f
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    const list = groups.get(k)
    if (list) list.push(item)
    else groups.set(k, [item])
  }
  return groups
}

// ---------------------------------------------------------------------------
// LTTB (largest triangle three buckets)
// ---------------------------------------------------------------------------

/**
 * Indices of the points kept by LTTB downsampling to `threshold` points. Keeps visual
 * shape, including spikes, far better than taking every n-th point.
 */
export function lttb(xs: number[], ys: number[], threshold: number): number[] {
  const n = xs.length
  if (threshold >= n || threshold < 3) return Array.from({ length: n }, (_, i) => i)
  const kept = [0]
  const every = (n - 2) / (threshold - 2)
  let a = 0
  for (let i = 0; i < threshold - 2; i += 1) {
    const avgStart = Math.floor((i + 1) * every) + 1
    const avgEnd = Math.min(Math.floor((i + 2) * every) + 1, n)
    let avgX = 0
    let avgY = 0
    for (let j = avgStart; j < avgEnd; j += 1) {
      avgX += xs[j]!
      avgY += ys[j]!
    }
    const count = Math.max(avgEnd - avgStart, 1)
    avgX /= count
    avgY /= count

    const rangeStart = Math.floor(i * every) + 1
    const rangeEnd = Math.floor((i + 1) * every) + 1
    let maxArea = -1
    let next = rangeStart
    for (let j = rangeStart; j < rangeEnd; j += 1) {
      const area = Math.abs(
        (xs[a]! - avgX) * (ys[j]! - ys[a]!) - (xs[a]! - xs[j]!) * (avgY - ys[a]!),
      )
      if (area > maxArea) {
        maxArea = area
        next = j
      }
    }
    kept.push(next)
    a = next
  }
  kept.push(n - 1)
  return kept
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

function matches(row: Row, filter: ColumnFilter): boolean {
  const value = row[filter.column]
  switch (filter.op) {
    case 'contains':
      return String(value ?? '')
        .toLowerCase()
        .includes(String(filter.value).toLowerCase())
    case 'startsWith':
      return String(value ?? '')
        .toLowerCase()
        .startsWith(String(filter.value).toLowerCase())
    case 'equals':
      return compare(value, filter.value) === 0
    case 'notEquals':
      return compare(value, filter.value) !== 0
    case 'gt':
      return num(value) > num(filter.value)
    case 'gte':
      return num(value) >= num(filter.value)
    case 'lt':
      return num(value) < num(filter.value)
    case 'lte':
      return num(value) <= num(filter.value)
    case 'in':
      return Array.isArray(filter.value) && filter.value.map(String).includes(String(value))
  }
  return true
}

function pick(columns: ColumnDef[], names?: string[]): ColumnDef[] {
  if (!names?.length) return columns
  return columns.filter((c) => names.includes(c.name))
}

export function shapeRows(rows: Row[], columns: ColumnDef[], shape: Shape): Shaped {
  switch (shape.kind) {
    case 'raw': {
      const cols = pick(columns, shape.columns)
      const limited = rows.slice(0, Math.min(shape.limit, 10_000))
      return {
        columns: cols,
        data: toColumnar(limited, cols),
        meta: { downsampled: limited.length < rows.length },
      }
    }

    case 'table': {
      const cols = pick(columns, shape.columns)
      let filtered = shape.filters?.length
        ? rows.filter((row) => shape.filters!.every((f) => matches(row, f)))
        : rows
      if (shape.sort?.length) {
        filtered = [...filtered].sort((a, b) => {
          for (const { column, dir } of shape.sort!) {
            const c = compare(a[column], b[column])
            if (c !== 0) return dir === 'desc' ? -c : c
          }
          return 0
        })
      }
      const page = filtered.slice(shape.offset, shape.offset + shape.limit)
      return {
        columns: cols,
        data: toColumnar(page, cols),
        meta: { downsampled: false, totalRows: filtered.length },
      }
    }

    case 'timeseries': {
      let source = rows
      if (shape.xRange) {
        const [from, to] = shape.xRange.map(num) as [number, number]
        source = source.filter((r) => {
          const x = num(r[shape.x])
          return x >= from && x <= to
        })
      }
      const series = groupBy(source, (r) => (shape.seriesBy ? String(r[shape.seriesBy]) : ''))
      const perSeries = Math.max(3, Math.floor(shape.targetPoints / Math.max(series.size, 1)))
      const kept: Row[] = []
      for (const points of series.values()) {
        const sorted = [...points].sort((a, b) => num(a[shape.x]) - num(b[shape.x]))
        const xs = sorted.map((r) => num(r[shape.x]))
        const ys = sorted.map((r) => num(r[shape.y[0] ?? '']))
        for (const index of lttb(xs, ys, perSeries)) kept.push(sorted[index]!)
      }
      kept.sort((a, b) => num(a[shape.x]) - num(b[shape.x]))
      return {
        columns,
        data: toColumnar(kept, columns),
        meta: { downsampled: kept.length < source.length },
      }
    }

    case 'scatter': {
      const step = Math.max(1, Math.ceil(rows.length / shape.maxPoints))
      const sampled = step === 1 ? rows : rows.filter((_, i) => i % step === 0)
      return {
        columns,
        data: toColumnar(sampled, columns),
        meta: { downsampled: sampled.length < rows.length },
      }
    }

    case 'histogram': {
      const values = rows.map((r) => num(r[shape.column])).filter(Number.isFinite)
      const min = Math.min(...values)
      const max = Math.max(...values)
      const bins = shape.bins ?? Math.min(60, Math.max(5, Math.ceil(Math.sqrt(values.length))))
      const width = max > min ? (max - min) / bins : 1
      const edges = Array.from({ length: bins + 1 }, (_, i) => round(min + i * width))
      const groups = groupBy(
        rows.filter((r) => Number.isFinite(num(r[shape.column]))),
        (r) => (shape.groupBy ? String(r[shape.groupBy]) : ''),
      )
      const out: Row[] = []
      for (const [group, members] of groups) {
        const counts: number[] = Array.from({ length: bins }, () => 0)
        for (const r of members) {
          const index = Math.min(bins - 1, Math.floor((num(r[shape.column]) - min) / width))
          counts[index]! += 1
        }
        counts.forEach((count, i) =>
          out.push({ bin_start: edges[i], bin_end: edges[i + 1], count, group }),
        )
      }
      const cols: ColumnDef[] = [
        { name: 'bin_start', type: 'float' },
        { name: 'bin_end', type: 'float' },
        { name: 'count', type: 'int' },
        { name: 'group', type: 'string' },
      ]
      return {
        columns: cols,
        data: toColumnar(out, cols),
        meta: { downsampled: true, edges: values.length ? edges : [] },
      }
    }

    case 'boxplot': {
      const groups = groupBy(rows, (r) => String(r[shape.groupBy]))
      const out: Row[] = []
      for (const [group, members] of [...groups].sort((a, b) => compare(a[0], b[0]))) {
        const values = members
          .map((r) => num(r[shape.value]))
          .filter(Number.isFinite)
          .sort((a, b) => a - b)
        if (!values.length) continue
        const q1 = quantile(values, 0.25)
        const median = quantile(values, 0.5)
        const q3 = quantile(values, 0.75)
        const iqr = q3 - q1
        const lowFence = q1 - 1.5 * iqr
        const highFence = q3 + 1.5 * iqr
        const inside = values.filter((v) => v >= lowFence && v <= highFence)
        const outliers = values.filter((v) => v < lowFence || v > highFence)
        out.push({
          group,
          min: round(inside[0] ?? values[0]!),
          q1: round(q1),
          median: round(median),
          q3: round(q3),
          max: round(inside[inside.length - 1] ?? values[values.length - 1]!),
          mean: round(values.reduce((s, v) => s + v, 0) / values.length),
          count: values.length,
          outliers: outliers.slice(0, shape.maxOutliers ?? 50).map((v) => round(v)),
        })
      }
      const cols: ColumnDef[] = [
        { name: 'group', type: 'string' },
        { name: 'min', type: 'float' },
        { name: 'q1', type: 'float' },
        { name: 'median', type: 'float' },
        { name: 'q3', type: 'float' },
        { name: 'max', type: 'float' },
        { name: 'mean', type: 'float' },
        { name: 'count', type: 'int' },
        { name: 'outliers', type: 'unknown' },
      ]
      return { columns: cols, data: toColumnar(out, cols), meta: { downsampled: true } }
    }

    case 'wafer': {
      const waferKey = shape.waferBy ?? 'wafer_id'
      const allWafers = [...new Set(rows.map((r) => String(r[waferKey])))].sort(compare)
      let selected = rows
      if (shape.mode !== 'stacked') {
        const wanted = shape.wafers?.length
          ? shape.wafers
          : shape.mode === 'single'
            ? allWafers.slice(0, 1)
            : allWafers
        const set = new Set(wanted)
        selected = rows.filter((r) => set.has(String(r[waferKey])))
      }
      const key = (r: Row) =>
        shape.mode === 'stacked'
          ? `${String(r[shape.x])},${String(r[shape.y])}`
          : `${String(r[waferKey])}|${String(r[shape.x])},${String(r[shape.y])}`
      const out: Row[] = []
      for (const members of groupBy(selected, key).values()) {
        const values = members
          .map((r) => num(r[shape.value]))
          .filter(Number.isFinite)
          .sort((a, b) => a - b)
        if (!values.length) continue
        const mean = values.reduce((s, v) => s + v, 0) / values.length
        const aggregated = {
          mean,
          median: quantile(values, 0.5),
          min: values[0]!,
          max: values[values.length - 1]!,
          count: values.length,
          std: Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length),
        }[shape.aggregate]
        const first = members[0]!
        out.push({
          wafer_id: shape.mode === 'stacked' ? 'stacked' : first[waferKey],
          lot_id: first.lot_id ?? null,
          unit: first.unit ?? null,
          x: num(first[shape.x]),
          y: num(first[shape.y]),
          value: round(aggregated, 4),
        })
      }
      const xs = out.map((r) => r.x as number)
      const ys = out.map((r) => r.y as number)
      const vs = out.map((r) => r.value as number)
      const cols: ColumnDef[] = [
        { name: 'wafer_id', type: 'string' },
        { name: 'lot_id', type: 'string' },
        { name: 'unit', type: 'string' },
        { name: 'x', type: 'int' },
        { name: 'y', type: 'int' },
        { name: 'value', type: 'float' },
      ]
      return {
        columns: cols,
        data: toColumnar(out, cols),
        meta: {
          downsampled: out.length < rows.length,
          wafers: allWafers,
          ...(out.length
            ? {
                xRange: [Math.min(...xs), Math.max(...xs)] as [number, number],
                yRange: [Math.min(...ys), Math.max(...ys)] as [number, number],
                valueRange: [Math.min(...vs), Math.max(...vs)] as [number, number],
              }
            : {}),
        },
      }
    }

    case 'distinct': {
      const search = shape.search?.toLowerCase() ?? ''
      const values = [...new Set(rows.map((r) => r[shape.column]))]
        .filter((v) => v !== null && v !== undefined)
        .map(String)
        .filter((v) => !search || v.toLowerCase().includes(search))
        .sort(compare)
      const limited = values.slice(0, shape.limit)
      return {
        columns: [{ name: 'value', type: 'string' }],
        data: { value: limited },
        meta: { downsampled: limited.length < values.length },
      }
    }
  }
}
