import { watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useFiltersStore } from '@/stores/filters'
import { useFilterDimensions } from './dimensions'
import { decodeFilter, encodeFilter, URL_PREFIX } from './values'

/**
 * Mirror canvas-level session filters in the URL (`?f.lot_id=A1,A2&f.time_range=last_30d`)
 * so a filtered view can be shared as a link. Published values are included — the link
 * reproduces what the sender saw. Group filters stay out of the URL.
 */
export function useFilterUrl(): void {
  const route = useRoute()
  const router = useRouter()
  const filters = useFiltersStore()
  const dimensions = useFilterDimensions()
  let applied = false

  // URL → session, once the vocabulary is known.
  watch(
    () => dimensions.data.value,
    (dims) => {
      if (!dims || applied) return
      applied = true
      for (const [key, raw] of Object.entries(route.query)) {
        if (!key.startsWith(URL_PREFIX) || typeof raw !== 'string') continue
        const dimension = dims.find((d) => d.id === key.slice(URL_PREFIX.length))
        const value = dimension && decodeFilter(dimension, raw)
        if (dimension && value) filters.setFilter('canvas', dimension.id, value)
      }
    },
    { immediate: true },
  )

  // Session → URL.
  watch(
    () => JSON.stringify(filters.session.canvas),
    () => {
      if (!applied) return
      const query: Record<string, string> = {}
      for (const [key, value] of Object.entries(route.query)) {
        if (!key.startsWith(URL_PREFIX) && typeof value === 'string') query[key] = value
      }
      for (const [dimension, entry] of Object.entries(filters.session.canvas)) {
        query[`${URL_PREFIX}${dimension}`] = encodeFilter(entry.value)
      }
      if (JSON.stringify(query) !== JSON.stringify(route.query)) void router.replace({ query })
    },
  )
}
