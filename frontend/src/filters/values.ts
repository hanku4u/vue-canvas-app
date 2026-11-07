import type { FilterDimension, FilterValue, TimeRangeValue } from '@/api/types'

/** Relative time-range presets (stored as-is, resolved at query time). */
export const TIME_PRESETS: { value: string; label: string; token: string }[] = [
  { value: 'last_24h', label: 'Last 24 hours', token: '-24h' },
  { value: 'last_7d', label: 'Last 7 days', token: '-7d' },
  { value: 'last_30d', label: 'Last 30 days', token: '-30d' },
  { value: 'last_90d', label: 'Last 90 days', token: '-90d' },
]

export function isEmptyFilter(value: FilterValue | null | undefined): boolean {
  if (value === null || value === undefined) return true
  if (Array.isArray(value)) return value.length === 0
  if ('relative' in value) return !value.relative
  if ('start' in value) return !value.start && !value.end
  return value.min === undefined && value.max === undefined
}

/** Start/end param values for a time range: relative tokens or absolute ISO times. */
export function timeRangeParams(value: TimeRangeValue): { start: string; end: string } {
  if ('relative' in value) {
    const preset = TIME_PRESETS.find((p) => p.value === value.relative)
    return { start: preset?.token ?? '-7d', end: 'now' }
  }
  return { start: value.start, end: value.end }
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/** Chip text for a filter value. */
export function describeFilter(value: FilterValue): string {
  if (Array.isArray(value)) {
    return value.length <= 2
      ? value.join(', ')
      : `${value.slice(0, 2).join(', ')} +${value.length - 2}`
  }
  if ('relative' in value) {
    return TIME_PRESETS.find((p) => p.value === value.relative)?.label ?? value.relative
  }
  if ('start' in value) return `${shortDate(value.start)} – ${shortDate(value.end)}`
  return `${value.min ?? '…'} – ${value.max ?? '…'}`
}

// ---------------------------------------------------------------------------
// URL encoding of canvas session filters: ?f.lot_id=A1,A2&f.time_range=last_7d
// (absolute times as start..end).
// ---------------------------------------------------------------------------

export const URL_PREFIX = 'f.'

export function encodeFilter(value: FilterValue): string {
  if (Array.isArray(value)) return value.join(',')
  if ('relative' in value) return value.relative
  if ('start' in value) return `${value.start}..${value.end}`
  return `${value.min ?? ''}..${value.max ?? ''}`
}

export function decodeFilter(dimension: FilterDimension, raw: string): FilterValue | null {
  if (!raw) return null
  switch (dimension.type) {
    case 'string_list': {
      const values = raw
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
      return values.length ? values : null
    }
    case 'time_range': {
      if (TIME_PRESETS.some((p) => p.value === raw)) return { relative: raw }
      const [start, end] = raw.split('..')
      return start && end && !Number.isNaN(Date.parse(start)) && !Number.isNaN(Date.parse(end))
        ? { start, end }
        : null
    }
    case 'number_range': {
      const [min, max] = raw.split('..').map((v) => (v === '' ? undefined : Number(v)))
      return { min, max }
    }
  }
}

/** Split pasted text (newlines, commas, tabs, spaces) into distinct values. */
export function splitPasted(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\s,;]+/)
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  ]
}
