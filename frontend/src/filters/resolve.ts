import type { FilterDimension, FilterSet, FilterValue } from '@/api/types'
import { isEmptyFilter } from './values'

/**
 * Filter resolution (docs/data-layer.md#scopes-and-resolution). For one component and one
 * dimension, the effective value is the first non-empty of:
 *
 *   1. component override
 *   2. group session value      (set in the UI, or published by a component in the group)
 *   3. group saved default
 *   4. canvas session value
 *   5. canvas saved default
 *   6. dimension default        (from GET /api/filters)
 *
 * Published values carry their source component, and a component never filters itself
 * on a value it published (otherwise selecting lots in a table would shrink the table to
 * the selected lots): such levels are skipped for the publisher.
 */

export interface SessionEntry {
  value: FilterValue
  /** Component that published this value (absent when set in the UI). */
  source?: string
}

export type ScopeSession = Record<string, SessionEntry>

export interface SessionFilters {
  canvas: ScopeSession
  groups: Record<string, ScopeSession>
}

export type ResolvedLevel =
  | 'component'
  | 'group-session'
  | 'group-default'
  | 'canvas-session'
  | 'canvas-default'
  | 'dimension'

export interface ResolvedFilter {
  value: FilterValue
  level: ResolvedLevel
  /** Component that published the value, if any. */
  source?: string
}

export interface ResolveInput {
  dimensions: FilterDimension[]
  session: SessionFilters
  canvasDefaults: FilterSet
  groupDefaults?: FilterSet
  groupId?: string | null
  componentId?: string
  overrides?: FilterSet
}

export function resolveFilters(input: ResolveInput): Record<string, ResolvedFilter> {
  const groupSession = input.groupId ? (input.session.groups[input.groupId] ?? {}) : {}
  const result: Record<string, ResolvedFilter> = {}
  for (const dimension of input.dimensions) {
    const id = dimension.id
    const fromSession = (entry: SessionEntry | undefined, level: ResolvedLevel) =>
      entry && !isEmptyFilter(entry.value) && !(entry.source && entry.source === input.componentId)
        ? { value: entry.value, level, source: entry.source }
        : null
    const fromValue = (value: FilterValue | undefined | null, level: ResolvedLevel) =>
      value && !isEmptyFilter(value) ? { value, level } : null

    const resolved =
      fromValue(input.overrides?.[id], 'component') ??
      fromSession(groupSession[id], 'group-session') ??
      fromValue(input.groupId ? input.groupDefaults?.[id] : undefined, 'group-default') ??
      fromSession(input.session.canvas[id], 'canvas-session') ??
      fromValue(input.canvasDefaults[id], 'canvas-default') ??
      fromValue(dimension.default, 'dimension')
    if (resolved) result[id] = resolved
  }
  return result
}

export function levelLabel(level: ResolvedLevel): string {
  switch (level) {
    case 'component':
      return 'this component'
    case 'group-session':
    case 'group-default':
      return 'group'
    case 'canvas-session':
    case 'canvas-default':
      return 'canvas'
    case 'dimension':
      return 'default'
  }
}
