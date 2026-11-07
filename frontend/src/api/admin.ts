import { computed, type MaybeRefOrGetter, toValue } from 'vue'
import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/vue-query'
import { api } from './client'
import type { CanvasRole, UserRef } from './types'

/** Admin API (docs/api.md#admin). Every endpoint requires admin rights. */

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

const keys = {
  all: ['admin'] as const,
  admins: () => [...keys.all, 'admins'] as const,
  canvases: (q: object) => [...keys.all, 'canvases', q] as const,
  access: (knoxId: string) => [...keys.all, 'access', knoxId] as const,
  usage: (kind: string, q: object) => [...keys.all, 'usage', kind, q] as const,
  health: () => [...keys.all, 'health'] as const,
  audit: (q: object) => [...keys.all, 'audit', q] as const,
}

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v))
  const s = q.toString()
  return s ? `?${s}` : ''
}

export function useAdmins() {
  return useQuery({
    queryKey: keys.admins(),
    queryFn: ({ signal }) => api.get<{ items: AdminEntry[] }>('/admin/admins', { signal }),
    select: (d) => d.items,
  })
}

export function useAdminCanvases(
  params: MaybeRefOrGetter<{ search: string; owner: string; deleted: boolean }>,
) {
  return useQuery(
    computed(() =>
      queryOptions({
        queryKey: keys.canvases(toValue(params)),
        queryFn: ({ signal }) =>
          api.get<{ items: AdminCanvas[] }>(`/admin/canvases${qs(toValue(params))}`, { signal }),
        placeholderData: keepPreviousData,
        select: (d) => d.items,
      }),
    ),
  )
}

export function useUserAccess(knoxId: MaybeRefOrGetter<string>) {
  return useQuery(
    computed(() =>
      queryOptions({
        queryKey: keys.access(toValue(knoxId)),
        queryFn: ({ signal }) =>
          api.get<UserAccess>(`/admin/users/${encodeURIComponent(toValue(knoxId))}/access`, {
            signal,
          }),
        enabled: !!toValue(knoxId),
        retry: false,
      }),
    ),
  )
}

function usageQuery<T>(
  kind: string,
  path: () => string,
  params: () => Record<string, string | number | undefined>,
) {
  return useQuery<T>({
    queryKey: computed(() => keys.usage(kind, { path: path(), ...params() })),
    queryFn: ({ signal }) => api.get<T>(`${path()}${qs(params())}`, { signal }),
    placeholderData: keepPreviousData,
  })
}

export const useUsageOverview = (range: MaybeRefOrGetter<UsageRange>) =>
  usageQuery<UsageOverview>(
    'overview',
    () => '/admin/usage/overview',
    () => ({ range: toValue(range) }),
  )

export const useDatasetUsage = (range: MaybeRefOrGetter<UsageRange>) =>
  usageQuery<{ items: DatasetUsage[] }>(
    'datasets',
    () => '/admin/usage/datasets',
    () => ({ range: toValue(range) }),
  )

export const useDatasetDetail = (
  id: MaybeRefOrGetter<string>,
  range: MaybeRefOrGetter<UsageRange>,
) =>
  usageQuery<DatasetDetail>(
    'dataset',
    () => `/admin/usage/datasets/${encodeURIComponent(toValue(id))}`,
    () => ({ range: toValue(range) }),
  )

export const useSlowQueries = (
  range: MaybeRefOrGetter<UsageRange>,
  thresholdMs: MaybeRefOrGetter<number>,
) =>
  usageQuery<{ items: QueryEvent[] }>(
    'slow',
    () => '/admin/usage/slow',
    () => ({ range: toValue(range), thresholdMs: toValue(thresholdMs) }),
  )

export const useErrorEvents = (
  range: MaybeRefOrGetter<UsageRange>,
  code: MaybeRefOrGetter<string>,
) =>
  usageQuery<{ items: ErrorEvent[]; codes: { code: string; count: number }[] }>(
    'errors',
    () => '/admin/usage/errors',
    () => ({ range: toValue(range), code: toValue(code) }),
  )

export function useHealth() {
  return useQuery({
    queryKey: keys.health(),
    queryFn: ({ signal }) => api.get<Health>('/admin/health', { signal }),
    refetchInterval: 30_000,
  })
}

export function useAudit(
  params: MaybeRefOrGetter<{ range: UsageRange; actor: string; action: string }>,
) {
  return useQuery(
    computed(() =>
      queryOptions({
        queryKey: keys.audit(toValue(params)),
        queryFn: ({ signal }) =>
          api.get<{ items: AuditEntry[]; actions: string[] }>(
            `/admin/audit${qs(toValue(params))}`,
            {
              signal,
            },
          ),
        placeholderData: keepPreviousData,
      }),
    ),
  )
}

/** Mutations invalidate everything under ['admin'] (and canvas lists). */
export function useAdminMutation<V>(fn: (vars: V) => Promise<unknown>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      void client.invalidateQueries({ queryKey: keys.all })
      void client.invalidateQueries({ queryKey: ['canvases'] })
    },
  })
}

export const adminApi = {
  grant: (knoxId: string) => api.post('/admin/admins', { knoxId }),
  revoke: (knoxId: string) => api.delete(`/admin/admins/${encodeURIComponent(knoxId)}`),
  transfer: (v: { id: string; newOwner: string; keepPreviousAsEditor: boolean }) =>
    api.post(`/admin/canvases/${encodeURIComponent(v.id)}/transfer`, {
      newOwner: v.newOwner,
      keepPreviousAsEditor: v.keepPreviousAsEditor,
    }),
  restore: (id: string) => api.post(`/admin/canvases/${encodeURIComponent(id)}/restore`),
  remove: (id: string) => api.delete(`/canvases/${encodeURIComponent(id)}`),
  revokeShares: (knoxId: string) =>
    api.post(`/admin/users/${encodeURIComponent(knoxId)}/revoke-shares`),
  transferAll: (v: { knoxId: string; newOwner: string }) =>
    api.post(`/admin/users/${encodeURIComponent(v.knoxId)}/transfer-all`, { newOwner: v.newOwner }),
}
