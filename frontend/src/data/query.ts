import { queryOptions, useQuery } from '@tanstack/vue-query'
import { computed, type MaybeRefOrGetter, toValue } from 'vue'
import { api, apiFetchResponse } from '@/api/client'
import type { Dataset, QueryRequest, QueryResult, ValuesResponse } from '@/api/types'
import { ARROW_MIME, decodeArrow } from './arrow'

/** POST /api/query. Accepts JSON or Arrow; both decode to the same columnar result. */
export async function postQuery(request: QueryRequest, signal?: AbortSignal): Promise<QueryResult> {
  const response = await apiFetchResponse('POST', '/query', request, {
    signal,
    headers: { accept: `application/json, ${ARROW_MIME};q=0.9` },
  })
  const requestId = response.headers.get('x-request-id') ?? undefined
  const result = response.headers.get('content-type')?.includes(ARROW_MIME)
    ? await decodeArrow(await response.arrayBuffer(), response.headers.get('x-query-meta'))
    : ((await response.json()) as QueryResult)
  result.meta = { ...result.meta, requestId: result.meta.requestId ?? requestId }
  return result
}

export const datasetsQuery = queryOptions({
  queryKey: ['datasets'],
  queryFn: ({ signal }) => api.get<{ items: Dataset[] }>('/datasets', { signal }),
  staleTime: 10 * 60_000,
  select: (data) => data.items,
})

export function useDatasets() {
  return useQuery(datasetsQuery)
}

/** Values for a parameter picker (GET /api/datasets/{id}/values/{param}). */
export function useParamValues(
  datasetId: MaybeRefOrGetter<string>,
  param: MaybeRefOrGetter<string>,
  search: MaybeRefOrGetter<string>,
  enabled: MaybeRefOrGetter<boolean> = true,
) {
  return useQuery(
    computed(() =>
      queryOptions({
        queryKey: ['param-values', toValue(datasetId), toValue(param), toValue(search)],
        queryFn: ({ signal }) => {
          const query = new URLSearchParams({ search: toValue(search), limit: '100' })
          return api.get<ValuesResponse>(
            `/datasets/${encodeURIComponent(toValue(datasetId))}/values/${encodeURIComponent(toValue(param))}?${query}`,
            { signal },
          )
        },
        enabled: !!toValue(datasetId) && toValue(enabled),
        staleTime: 5 * 60_000,
        placeholderData: (previous) => previous,
      }),
    ),
  )
}
