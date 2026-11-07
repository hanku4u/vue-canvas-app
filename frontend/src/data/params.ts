import type { Dataset, DatasetParam } from '@/api/types'

/**
 * Parameter values as components store them, resolved into what /api/query receives.
 * Datetime params may hold relative tokens ("now", "-7d", "-24h", "-30m") so saved
 * canvases keep showing recent data; they're resolved at query time, rounded down to the
 * minute so query keys (and the server cache) stay stable within a minute.
 */

const RELATIVE = /^-(\d+)([mhdw])$/
const UNIT_MS: Record<string, number> = {
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 7 * 86_400_000,
}

export const RELATIVE_TIME_PRESETS: { value: string; label: string }[] = [
  { value: 'now', label: 'Now' },
  { value: '-1h', label: '1 hour ago' },
  { value: '-24h', label: '24 hours ago' },
  { value: '-7d', label: '7 days ago' },
  { value: '-30d', label: '30 days ago' },
  { value: '-90d', label: '90 days ago' },
]

export function isRelativeTime(value: unknown): value is string {
  return value === 'now' || (typeof value === 'string' && RELATIVE.test(value))
}

/** Absolute ISO timestamp for a relative token (or the value itself if absolute). */
export function resolveTime(value: string, now: number = Date.now()): string {
  const minute = Math.floor(now / 60_000) * 60_000
  if (value === 'now') return new Date(minute).toISOString()
  const match = RELATIVE.exec(value)
  if (match) return new Date(minute - Number(match[1]) * UNIT_MS[match[2]!]!).toISOString()
  return value
}

export function describeTime(value: unknown): string {
  if (typeof value !== 'string') return ''
  const preset = RELATIVE_TIME_PRESETS.find((p) => p.value === value)
  if (preset) return preset.label
  return isRelativeTime(value) ? value : new Date(value).toLocaleString()
}

function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  )
}

/** Stored values over dataset defaults, with relative times resolved. Empty values are dropped. */
export function effectiveParams(
  dataset: Dataset,
  stored: Record<string, unknown>,
  now: number = Date.now(),
): Record<string, unknown> {
  const params: Record<string, unknown> = {}
  for (const param of dataset.params) {
    let value = isEmpty(stored[param.name]) ? param.default : stored[param.name]
    if (isEmpty(value)) continue
    if ((param.type === 'datetime' || param.type === 'date') && typeof value === 'string') {
      value = resolveTime(value, now)
    }
    params[param.name] = value
  }
  return params
}

/** Required params without a value. */
export function missingRequired(dataset: Dataset, params: Record<string, unknown>): DatasetParam[] {
  return dataset.params.filter((p) => p.required && isEmpty(params[p.name]))
}
