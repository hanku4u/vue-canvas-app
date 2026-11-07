import { queryOptions, useQuery } from '@tanstack/vue-query'
import { api } from './client'
import type { Me } from './types'

export const meQuery = queryOptions({
  queryKey: ['me'],
  queryFn: ({ signal }) => api.get<Me>('/me', { signal }),
  staleTime: 5 * 60_000,
})

export function useMe() {
  return useQuery(meQuery)
}
