import { computed, type MaybeRefOrGetter, toValue } from 'vue'
import { queryOptions, useQuery } from '@tanstack/vue-query'
import { api } from './client'
import type { ComponentAccessSettings, Share, UserRef } from './types'

/** Known users, for the share and restriction dialogs (GET /api/users). */
export function useUserSearch(search: MaybeRefOrGetter<string>) {
  return useQuery(
    computed(() =>
      queryOptions({
        queryKey: ['users', toValue(search)],
        queryFn: ({ signal }) =>
          api.get<{ items: UserRef[] }>(
            `/users?${new URLSearchParams({ search: toValue(search), limit: '20' })}`,
            { signal },
          ),
        staleTime: 60_000,
        placeholderData: (previous) => previous,
        select: (data) => data.items,
      }),
    ),
  )
}

export function getShares(canvasId: string): Promise<{ shares: Share[] }> {
  return api.get(`/canvases/${encodeURIComponent(canvasId)}/shares`)
}

export function putShares(canvasId: string, shares: Share[]): Promise<{ shares: Share[] }> {
  return api.put(`/canvases/${encodeURIComponent(canvasId)}/shares`, {
    shares: shares.map(({ knoxId, role }) => ({ knoxId, role })),
  })
}

const accessPath = (canvasId: string, componentId: string) =>
  `/canvases/${encodeURIComponent(canvasId)}/components/${encodeURIComponent(componentId)}/access`

export function getComponentAccess(
  canvasId: string,
  componentId: string,
): Promise<ComponentAccessSettings & { version: number }> {
  return api.get(accessPath(canvasId, componentId))
}

export function putComponentAccess(
  canvasId: string,
  componentId: string,
  settings: ComponentAccessSettings,
): Promise<ComponentAccessSettings & { version: number }> {
  return api.put(accessPath(canvasId, componentId), {
    ...settings,
    acl: settings.acl.map(({ knoxId, access }) => ({ knoxId, access })),
  })
}
