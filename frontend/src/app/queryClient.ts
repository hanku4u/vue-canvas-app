import { QueryClient } from '@tanstack/vue-query'
import { ApiError } from '@/api/client'

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Retry network and server errors, never client errors (403, 404, 409, ...).
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.isClientError) && failureCount < 2,
      },
      mutations: {
        retry: false,
      },
    },
  })
}
