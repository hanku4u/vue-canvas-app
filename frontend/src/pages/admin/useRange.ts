import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { UsageRange } from '@/api/admin'

/** The admin time range, kept in the URL (`?range=24h|7d|30d`, default 7d). */
export function useRange() {
  const route = useRoute()
  const router = useRouter()
  return computed<UsageRange>({
    get: () => {
      const value = route.query.range
      return value === '24h' || value === '30d' ? value : '7d'
    },
    set: (range) => void router.replace({ query: { ...route.query, range } }),
  })
}

/** Other query-string state for admin pages (search boxes, filters). */
export function useQueryParam(name: string, fallback = '') {
  const route = useRoute()
  const router = useRouter()
  return computed<string>({
    get: () => (typeof route.query[name] === 'string' ? (route.query[name] as string) : fallback),
    set: (value) => void router.replace({ query: { ...route.query, [name]: value || undefined } }),
  })
}
