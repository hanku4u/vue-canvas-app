/**
 * Deterministic usage fixtures for the admin screens (docs/admin.md, "Usage & health"),
 * standing in for aggregates over FastAPI's query_log. Numbers come from a hash of the
 * hour and dataset, so a page shows the same data on every load and in every test.
 *
 * Planted story: a data API outage 3 days ago, 14:00–15:00 (errors spike, upstream
 * timeouts, the health history shows it), and spc_points is the slow, busy dataset.
 */
import { getDb } from './db'
import { MOCK_DATASETS } from './datasets'

const HOUR = 3_600_000
const DAY = 24 * HOUR

export type UsageRange = '24h' | '7d' | '30d'

export const RANGE_MS: Record<UsageRange, number> = { '24h': DAY, '7d': 7 * DAY, '30d': 30 * DAY }

/** 0..1 pseudo-random from integers (xmur3-ish mix). */
function rand(...parts: number[]): number {
  let h = 2166136261
  for (const p of parts) {
    h ^= p
    h = Math.imul(h, 16777619)
    h ^= h >>> 13
    h = Math.imul(h, 0x5bd1e995)
    h ^= h >>> 15
  }
  return (h >>> 0) / 4294967296
}

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i += 1) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  return h
}

/** Start of the planted outage (an hour 3 days ago, at 14:00 local time). */
export function outageStart(now = Date.now()): number {
  const d = new Date(now - 3 * DAY)
  d.setHours(14, 0, 0, 0)
  return d.getTime()
}

export function inOutage(t: number, now = Date.now()): boolean {
  const start = outageStart(now)
  return t >= start && t < start + HOUR
}

/** Busy during working hours on weekdays, quiet at night and on weekends. */
function activity(t: number): number {
  const d = new Date(t)
  const hour = d.getHours()
  const weekday = d.getDay() !== 0 && d.getDay() !== 6
  const daytime = hour >= 7 && hour <= 19 ? 1 - Math.abs(hour - 13) / 9 : 0.05
  return (weekday ? 1 : 0.2) * Math.max(0.04, daytime)
}

interface DatasetProfile {
  id: string
  label: string
  weight: number
  p50: number
  p95: number
  cacheHit: number
  errorRate: number
  upstreamRows: number
  returnedRows: number
}

const PROFILES: Record<string, Partial<DatasetProfile>> = {
  spc_points: {
    weight: 10,
    p50: 420,
    p95: 6200,
    cacheHit: 0.71,
    upstreamRows: 410_000,
    returnedRows: 2_100,
  },
  lots: { weight: 6, p50: 180, p95: 1400, cacheHit: 0.64, upstreamRows: 2_400, returnedRows: 200 },
  wafer_dies: {
    weight: 4,
    p50: 900,
    p95: 11_500,
    cacheHit: 0.52,
    upstreamRows: 95_000,
    returnedRows: 9_800,
  },
  lot_history: {
    weight: 2,
    p50: 140,
    p95: 900,
    cacheHit: 0.58,
    upstreamRows: 60,
    returnedRows: 60,
  },
  wafers: { weight: 2, p50: 120, p95: 700, cacheHit: 0.6, upstreamRows: 250, returnedRows: 200 },
}

export function datasetProfiles(): DatasetProfile[] {
  return MOCK_DATASETS.map((d) => ({
    id: d.id,
    label: d.label,
    weight: 0.5,
    p50: 90,
    p95: 450,
    cacheHit: 0.8,
    errorRate: 0.004,
    upstreamRows: 80,
    returnedRows: 80,
    ...PROFILES[d.id],
  }))
}

export interface HourBucket {
  t: number
  queries: number
  errors: number
  users: number
  /** Queries per dataset id. */
  byDataset: Record<string, number>
}

/** Hourly buckets covering [from, to). */
export function hourly(from: number, to: number, now = Date.now()): HourBucket[] {
  const profiles = datasetProfiles()
  const totalWeight = profiles.reduce((a, p) => a + p.weight, 0)
  const buckets: HourBucket[] = []
  for (let t = Math.floor(from / HOUR) * HOUR; t < to; t += HOUR) {
    const index = Math.floor(t / HOUR)
    const queries = Math.round(activity(t) * (180 + 60 * rand(index, 1)))
    const outage = inOutage(t, now)
    const byDataset: Record<string, number> = {}
    let errors = 0
    for (const p of profiles) {
      const n = Math.round((queries * p.weight) / totalWeight)
      byDataset[p.id] = n
      const rate = outage ? 0.6 : p.errorRate * (0.5 + rand(index, hashString(p.id)))
      errors += Math.round(n * rate)
    }
    buckets.push({
      t,
      queries,
      errors,
      users: Math.round(activity(t) * (24 + 8 * rand(index, 2))),
      byDataset,
    })
  }
  return buckets
}

export const USERS = ['j.doe', 'k.lee', 'm.park', 's.choi', 'a.kim', 'b.lim', 'c.han', 'd.yoo']

export const ERROR_CODES = [
  { code: 'UPSTREAM_TIMEOUT', message: 'The data API did not answer within 30 s' },
  { code: 'UPSTREAM_ERROR', message: 'Data API returned 502 Bad Gateway' },
  { code: 'TOO_MANY_ROWS', message: 'Query would return more than 5,000,000 rows' },
  { code: 'INVALID_PARAMS', message: 'Parameter "tool" is required' },
]

export interface QueryEvent {
  ts: string
  user: string
  dataset: string
  canvasId: string | null
  canvasTitle: string | null
  componentId: string | null
  durationMs: number
  upstreamMs: number
  shapingMs: number
  rows: number
  requestId: string
}

export interface ErrorEvent extends Omit<
  QueryEvent,
  'durationMs' | 'upstreamMs' | 'shapingMs' | 'rows'
> {
  code: string
  message: string
}

function canvasRefs(): { canvasId: string; canvasTitle: string; componentId: string | null }[] {
  const db = getDb()
  return Object.values(db.canvases)
    .filter((c) => !c.deletedAt)
    .map((c) => ({
      canvasId: c.id,
      canvasTitle: c.title,
      componentId: Object.values(db.components).find((x) => x.canvasId === c.id)?.id ?? null,
    }))
}

/** Individual slow calls (above `thresholdMs`), newest first. */
export function slowQueries(
  from: number,
  to: number,
  thresholdMs: number,
  now = Date.now(),
): QueryEvent[] {
  const profiles = datasetProfiles()
  const refs = canvasRefs()
  const events: QueryEvent[] = []
  for (const bucket of hourly(from, to, now)) {
    const index = Math.floor(bucket.t / HOUR)
    for (const p of profiles) {
      const n = bucket.byDataset[p.id] ?? 0
      // A few calls per busy hour land in the tail.
      const tail = Math.floor((n * 0.03 * p.p95) / 6000 + rand(index, hashString(p.id), 3))
      for (let i = 0; i < tail; i += 1) {
        const r = rand(index, hashString(p.id), i, 4)
        const durationMs = Math.round(p.p95 * (0.6 + 1.8 * r))
        if (durationMs < thresholdMs) continue
        const ref = refs.length ? refs[Math.floor(rand(index, i, 5) * refs.length)]! : null
        const upstreamMs = Math.round(durationMs * (0.82 + 0.15 * rand(index, i, 6)))
        events.push({
          ts: new Date(bucket.t + Math.floor(rand(index, i, 7) * HOUR)).toISOString(),
          user: USERS[Math.floor(rand(index, i, 8) * USERS.length)]!,
          dataset: p.id,
          canvasId: ref?.canvasId ?? null,
          canvasTitle: ref?.canvasTitle ?? null,
          componentId: ref?.componentId ?? null,
          durationMs,
          upstreamMs,
          shapingMs: durationMs - upstreamMs,
          rows: Math.round(p.upstreamRows * (0.5 + r)),
          requestId: `req-${index.toString(36)}-${i}`,
        })
      }
    }
  }
  return events.sort((a, b) => b.ts.localeCompare(a.ts))
}

/** Individual failures, newest first. */
export function errorEvents(from: number, to: number, now = Date.now()): ErrorEvent[] {
  const profiles = datasetProfiles()
  const refs = canvasRefs()
  const events: ErrorEvent[] = []
  for (const bucket of hourly(from, to, now)) {
    const index = Math.floor(bucket.t / HOUR)
    const outage = inOutage(bucket.t, now)
    for (let i = 0; i < bucket.errors; i += 1) {
      const r = rand(index, i, 9)
      const error = outage
        ? ERROR_CODES[r < 0.8 ? 0 : 1]!
        : ERROR_CODES[Math.floor(r * ERROR_CODES.length)]!
      const p = profiles[Math.floor(rand(index, i, 10) * profiles.length)]!
      const ref = refs.length ? refs[Math.floor(rand(index, i, 11) * refs.length)]! : null
      events.push({
        ts: new Date(bucket.t + Math.floor(rand(index, i, 12) * HOUR)).toISOString(),
        user: USERS[Math.floor(rand(index, i, 13) * USERS.length)]!,
        dataset: outage ? 'spc_points' : p.id,
        canvasId: ref?.canvasId ?? null,
        canvasTitle: ref?.canvasTitle ?? null,
        componentId: ref?.componentId ?? null,
        code: error.code,
        message: error.message,
        requestId: `req-${index.toString(36)}-e${i}`,
      })
    }
  }
  return events.sort((a, b) => b.ts.localeCompare(a.ts))
}

export function percentile(values: number[], p: number): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!
}
