import { shallowReactive } from 'vue'
import { defineStore } from 'pinia'
import type { ApiError } from '@/api/client'
import type { QueryMeta, QueryRequest } from '@/api/types'

export type DataState =
  'unconfigured' | 'missing' | 'loading' | 'refetching' | 'ready' | 'empty' | 'error'

/** What a data component's query looks like right now (for the frame header and details). */
export interface ComponentDataInfo {
  state: DataState
  fetching: boolean
  request: QueryRequest | null
  meta: QueryMeta | null
  error: ApiError | Error | null
  refresh: () => void
}

/**
 * Data components publish their query state here (keyed by component id), so the shared
 * component frame can show data age, a refresh button and "View query details" without
 * knowing how each component queries.
 */
export const useComponentDataStore = defineStore('componentData', () => {
  const byId = shallowReactive(new Map<string, ComponentDataInfo>())

  function publish(id: string, info: ComponentDataInfo): void {
    byId.set(id, info)
  }

  function remove(id: string): void {
    byId.delete(id)
  }

  /** Last rendered image of a component (PNG data URL), for zoomed-out previews. */
  const snapshots = shallowReactive(new Map<string, string>())

  function setSnapshot(id: string, dataUrl: string): void {
    snapshots.set(id, dataUrl)
  }

  return { byId, publish, remove, snapshots, setSnapshot }
})
