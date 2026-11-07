import { computed, type MaybeRefOrGetter, toValue } from 'vue'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { api } from './client'
import type {
  Canvas,
  CanvasListScope,
  CanvasOp,
  CanvasSummary,
  CreateCanvasRequest,
  OpsResult,
  Page,
} from './types'

// ---------------------------------------------------------------------------
// Plain API calls
// ---------------------------------------------------------------------------

export interface CanvasListParams {
  scope: CanvasListScope
  search?: string
  limit?: number
}

export function listCanvases(params: CanvasListParams, signal?: AbortSignal) {
  const query = new URLSearchParams({ scope: params.scope, limit: String(params.limit ?? 100) })
  if (params.search) query.set('search', params.search)
  return api.get<Page<CanvasSummary>>(`/canvases?${query}`, { signal })
}

export const getCanvas = (id: string, signal?: AbortSignal) =>
  api.get<Canvas>(`/canvases/${encodeURIComponent(id)}`, { signal })

export const createCanvas = (body: CreateCanvasRequest) => api.post<Canvas>('/canvases', body)

export const deleteCanvas = (id: string) => api.delete(`/canvases/${encodeURIComponent(id)}`)

export const duplicateCanvas = (id: string, title: string) =>
  api.post<Canvas>(`/canvases/${encodeURIComponent(id)}/duplicate`, { title })

export const applyOps = (id: string, ops: CanvasOp[]) =>
  api.post<OpsResult>(`/canvases/${encodeURIComponent(id)}/ops`, { ops })

// ---------------------------------------------------------------------------
// Vue Query
// ---------------------------------------------------------------------------

export const canvasKeys = {
  all: ['canvases'] as const,
  lists: () => [...canvasKeys.all, 'list'] as const,
  list: (params: CanvasListParams) => [...canvasKeys.lists(), params] as const,
  detail: (id: string) => [...canvasKeys.all, 'detail', id] as const,
}

export function useCanvasList(params: MaybeRefOrGetter<CanvasListParams>) {
  return useQuery(
    computed(() => {
      const value = toValue(params)
      return queryOptions({
        queryKey: canvasKeys.list(value),
        queryFn: ({ signal }) => listCanvases(value, signal),
        placeholderData: (previous) => previous,
      })
    }),
  )
}

export function useCanvas(id: MaybeRefOrGetter<string>) {
  return useQuery(
    computed(() =>
      queryOptions({
        queryKey: canvasKeys.detail(toValue(id)),
        queryFn: ({ signal }) => getCanvas(toValue(id), signal),
      }),
    ),
  )
}

/** Mutations for canvas-level actions. Each refreshes the canvas lists when it settles. */
export function useCanvasMutations() {
  const queryClient = useQueryClient()
  const invalidate = (id?: string) => {
    void queryClient.invalidateQueries({ queryKey: canvasKeys.lists() })
    if (id) void queryClient.invalidateQueries({ queryKey: canvasKeys.detail(id) })
  }

  const create = useMutation({
    mutationFn: createCanvas,
    onSettled: () => invalidate(),
  })

  const rename = useMutation({
    mutationFn: (vars: { id: string; version: number; title: string; description?: string }) =>
      applyOps(vars.id, [
        {
          op: 'canvas.update',
          version: vars.version,
          set: { title: vars.title, description: vars.description },
        },
      ]),
    onSettled: (_data, _error, vars) => invalidate(vars.id),
  })

  const duplicate = useMutation({
    mutationFn: (vars: { id: string; title: string }) => duplicateCanvas(vars.id, vars.title),
    onSettled: () => invalidate(),
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteCanvas(id),
    onSuccess: (_data, id) => queryClient.removeQueries({ queryKey: canvasKeys.detail(id) }),
    onSettled: () => invalidate(),
  })

  return { create, rename, duplicate, remove }
}
