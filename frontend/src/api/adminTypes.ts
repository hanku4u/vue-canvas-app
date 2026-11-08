import type { CanvasRole, UserRef } from './types'

/** Admin API wire types (docs/api.md#admin). */

export type UsageRange = '24h' | '7d' | '30d'

export interface AdminEntry extends UserRef {
  source: 'db' | 'config'
  grantedBy: string | null
  grantedAt: string | null
}

export interface AdminCanvas {
  id: string
  title: string
  owner: UserRef
  shareCount: number
  restrictedCount: number
  componentCount: number
  updatedAt: string
  deletedAt: string | null
}

export interface UserAccess {
  user: UserRef
  isAdmin: boolean
  owned: { id: string; title: string; updatedAt: string }[]
  shared: { id: string; title: string; role: CanvasRole; owner: UserRef }[]
  acl: {
    canvasId: string
    canvasTitle: string
    componentId: string
    componentTitle: string
    access: 'view' | 'edit'
  }[]
  hiddenFrom: {
    canvasId: string
    canvasTitle: string
    componentId: string
    componentTitle: string
  }[]
}

export interface UsageTiles {
  activeUsers: number
  queries: number
  cacheHitRate: number
  errorRate: number
  p95Ms: number
  canvasesCreated: number
}

export interface UsageOverview {
  from: string
  to: string
  tiles: UsageTiles
  hourly: { t: string; queries: number; errors: number }[]
  dailyUsers: { day: string; users: number }[]
  topCanvases: { id: string; title: string; queries: number }[]
  componentMix: { type: string; count: number }[]
}

export interface DatasetUsage {
  id: string
  label: string
  calls: number
  users: number
  cacheHitRate: number
  p50Ms: number
  p95Ms: number
  errorRate: number
  avgUpstreamRows: number
  avgReturnedRows: number
}

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

export interface ErrorEvent {
  ts: string
  user: string
  dataset: string
  canvasId: string | null
  canvasTitle: string | null
  componentId: string | null
  code: string
  message: string
  requestId: string
}

export interface DatasetDetail {
  dataset: DatasetUsage
  latency: { t: string; p50Ms: number; p95Ms: number; calls: number }[]
  errorsByCode: { code: string; count: number }[]
  slowest: QueryEvent[]
  canvases: { id: string; title: string; components: number }[]
}

export type HealthStatus = 'ok' | 'degraded' | 'down'

export interface Health {
  checkedAt: string
  dataApi: {
    status: HealthStatus
    latencyMs: number | null
    lastSuccess: string | null
    lastFailure: { at: string; message: string } | null
    history: { t: string; ok: boolean; latencyMs: number | null }[]
  }
  database: { status: HealthStatus; poolInUse: number; poolSize: number }
  cache: {
    status: HealthStatus
    entries: number
    bytes: number
    maxBytes: number
    hitRate: number
    evictions: number
  }
  concurrency: { status: HealthStatus; inFlight: number; cap: number; queued: number }
  app: {
    status: HealthStatus
    version: string
    commit: string
    startedAt: string
    datasetsLoaded: number
    datasetLoadErrors: string[]
  }
}

export interface AuditEntry {
  id: string
  ts: string
  actor: UserRef
  action: string
  target: string
  details: Record<string, unknown>
}
