import { computed, type MaybeRefOrGetter, toValue } from 'vue'
import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/vue-query'
import { api } from './client'
import type {
  UsageRange,
  AdminEntry,
  AdminCanvas,
  UserAccess,
  UsageOverview,
  DatasetUsage,
  QueryEvent,
  ErrorEvent,
  DatasetDetail,
  Health,
  AuditEntry,
} from './adminTypes'

export type * from './adminTypes'

/** Admin API (docs/api.md#admin). Every endpoint requires admin rights. */

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
