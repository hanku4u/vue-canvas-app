import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { FilterValue } from '@/api/types'
import type { ScopeSession, SessionFilters } from '@/filters/resolve'
import { isEmptyFilter } from '@/filters/values'

/** A filter scope: the whole canvas, or one group (by id). */
export type FilterScope = 'canvas' | string

/**
 * Session filters (docs/canvas-ux.md, Filters: "Session vs saved"): what the user set in
 * the filter bar / group headers, and what components published (selections). Never
 * saved; canvas-level values are mirrored in the URL. Saved defaults live on the canvas
 * and groups (canvasDoc).
 */
export const useFiltersStore = defineStore('filters', () => {
  const session = ref<SessionFilters>({ canvas: {}, groups: {} })

  function scope(name: FilterScope): ScopeSession {
    if (name === 'canvas') return session.value.canvas
    session.value.groups[name] ??= {}
    return session.value.groups[name]!
  }

  function peek(name: FilterScope): ScopeSession {
    return name === 'canvas' ? session.value.canvas : (session.value.groups[name] ?? {})
  }

  /** Set (or clear, with null) a filter in a scope from the UI. */
  function setFilter(name: FilterScope, dimension: string, value: FilterValue | null): void {
    const target = scope(name)
    if (!value || isEmptyFilter(value)) delete target[dimension]
    else target[dimension] = { value }
  }

  /** A component publishes a selection into its scope (null withdraws it). */
  function publish(
    componentId: string,
    name: FilterScope,
    dimension: string,
    value: FilterValue | null,
  ): void {
    const target = scope(name)
    const current = target[dimension]
    if (!value || isEmptyFilter(value)) {
      if (current?.source === componentId) delete target[dimension]
      return
    }
    if (JSON.stringify(current) !== JSON.stringify({ value, source: componentId })) {
      target[dimension] = { value, source: componentId }
    }
  }

  /** Withdraw everything a component published (e.g. before re-publishing). */
  function clearPublishedBy(
    componentId: string,
    except?: { scope: FilterScope; dims: string[] },
  ): void {
    const scopes: [FilterScope, ScopeSession][] = [
      ['canvas', session.value.canvas],
      ...Object.entries(session.value.groups),
    ]
    for (const [name, entries] of scopes) {
      for (const [dimension, entry] of Object.entries(entries)) {
        if (entry.source !== componentId) continue
        if (except && except.scope === name && except.dims.includes(dimension)) continue
        delete entries[dimension]
      }
    }
  }

  function clearScope(name: FilterScope): void {
    const entries = scope(name)
    for (const key of Object.keys(entries)) delete entries[key]
  }

  function reset(): void {
    session.value = { canvas: {}, groups: {} }
  }

  return { session, peek, setFilter, publish, clearPublishedBy, clearScope, reset }
})
