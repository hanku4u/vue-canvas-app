import type { Dataset, FilterValue, TimeRangeValue } from '@/api/types'
import type { ResolvedFilter, ResolvedLevel } from './resolve'
import { timeRangeParams } from './values'

/**
 * Filters → dataset params (docs/data-layer.md#from-filters-to-params). A param follows the
 * dimension named by its `filter` hint ("tool_id", "time_range.start") unless the component
 * switched that binding off. A bound param with an effective filter value uses it;
 * otherwise the component's own param value (or the dataset default) applies.
 *
 * The dimension-level default (e.g. "last 7 days" for time_range) is the weakest: it only
 * fills params the component left unset. Canvas and group values always apply.
 */

export interface Binding {
  param: string
  dimension: string
  /** Where the value came from, or null when the filter has no value right now. */
  level: ResolvedLevel | null
  value?: FilterValue
  source?: string
}

/** The dimension a param can follow ("time_range.start" → "time_range"). */
export function bindableDimension(filterHint: string | null): string | null {
  return filterHint ? (filterHint.split('.')[0] ?? null) : null
}

export function isBound(param: string, bindings: Record<string, boolean>): boolean {
  return bindings[param] !== false
}

export function paramsFromFilters(
  dataset: Dataset,
  resolved: Record<string, ResolvedFilter>,
  bindings: Record<string, boolean>,
  own: Record<string, unknown> = {},
): { params: Record<string, unknown>; bound: Binding[] } {
  const params: Record<string, unknown> = {}
  const bound: Binding[] = []
  for (const param of dataset.params) {
    const dimension = bindableDimension(param.filter)
    if (!dimension || !isBound(param.name, bindings)) continue
    const candidate = resolved[dimension]
    const hasOwn =
      own[param.name] !== undefined && own[param.name] !== null && own[param.name] !== ''
    const filter = candidate?.level === 'dimension' && hasOwn ? undefined : candidate
    bound.push({
      param: param.name,
      dimension,
      level: filter?.level ?? null,
      value: filter?.value,
      source: filter?.source,
    })
    if (!filter) continue
    if (dimension === 'time_range') {
      const part = param.filter?.split('.')[1] as 'start' | 'end' | undefined
      if (part) params[param.name] = timeRangeParams(filter.value as TimeRangeValue)[part]
    } else if (Array.isArray(filter.value)) {
      params[param.name] = param.type === 'string[]' ? filter.value : filter.value[0]
    }
  }
  return { params, bound }
}
