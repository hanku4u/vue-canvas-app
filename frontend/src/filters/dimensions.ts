import { computed, type MaybeRefOrGetter, toValue } from 'vue'
import { queryOptions, useQuery } from '@tanstack/vue-query'
import { api } from '@/api/client'
import type { FilterDimension, ValuesResponse } from '@/api/types'

export const dimensionsQuery = queryOptions({
  queryKey: ['filter-dimensions'],
  queryFn: ({ signal }) => api.get<{ items: FilterDimension[] }>('/filters', { signal }),
  staleTime: 10 * 60_000,
  select: (data) => data.items,
})

/** The shared filter vocabulary (GET /api/filters). */
export function useFilterDimensions() {
  return useQuery(dimensionsQuery)
}

/** Values for a filter value picker (GET /api/filters/{id}/values). */
export function useDimensionValues(
  dimension: MaybeRefOrGetter<string>,
  search: MaybeRefOrGetter<string>,
  enabled: MaybeRefOrGetter<boolean> = true,
) {
  return useQuery(
    computed(() =>
      queryOptions({
        queryKey: ['filter-values', toValue(dimension), toValue(search)],
        queryFn: ({ signal }) => {
          const q = new URLSearchParams({ search: toValue(search), limit: '100' })
          return api.get<ValuesResponse>(
            `/filters/${encodeURIComponent(toValue(dimension))}/values?${q}`,
            { signal },
          )
        },
        enabled: toValue(enabled),
        staleTime: 5 * 60_000,
        placeholderData: (previous) => previous,
      }),
    ),
  )
}
