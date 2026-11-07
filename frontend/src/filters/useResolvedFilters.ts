import { computed, type MaybeRefOrGetter, toValue } from 'vue'
import { useCanvasDocStore } from '@/stores/canvasDoc'
import { useFiltersStore } from '@/stores/filters'
import { useFilterDimensions } from './dimensions'
import { resolveFilters } from './resolve'

/**
 * Effective filters for a component (or, without one, for a group or the canvas): the
 * resolution in resolve.ts over saved defaults, session values and dimension defaults.
 */
export function useResolvedFilters(options: {
  componentId?: MaybeRefOrGetter<string | undefined>
  groupId?: MaybeRefOrGetter<string | null | undefined>
}) {
  const doc = useCanvasDocStore()
  const filters = useFiltersStore()
  const dimensions = useFilterDimensions()

  return computed(() => {
    const componentId = toValue(options.componentId)
    const component = componentId ? doc.components[componentId] : undefined
    const groupId = toValue(options.groupId) ?? component?.groupId ?? null
    return resolveFilters({
      dimensions: dimensions.data.value ?? [],
      session: filters.session,
      canvasDefaults: doc.canvas?.defaultFilters ?? {},
      groupDefaults: groupId ? doc.groups[groupId]?.defaultFilters : undefined,
      groupId,
      componentId,
      overrides: (component?.config.overrides as never) ?? undefined,
    })
  })
}
