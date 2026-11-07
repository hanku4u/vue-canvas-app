import { computed, onBeforeUnmount, ref, watch, watchEffect, type Ref } from 'vue'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { QueryRequest, QueryResult, Shape } from '@/api/types'
import { useComponentDataStore, type DataState } from '@/stores/componentData'
import { useCanvasDocStore } from '@/stores/canvasDoc'
import { paramsFromFilters } from '@/filters/bindings'
import { useResolvedFilters } from '@/filters/useResolvedFilters'
import { effectiveParams, missingRequired } from './params'
import { postQuery, useDatasets } from './query'

export interface ComponentQueryOptions {
  componentId: Ref<string>
  dataset: Ref<string>
  /** Stored param values (may contain relative times). */
  params: Ref<Record<string, unknown>>
  /** Which params follow their filter dimension (false = not); default all. */
  bindings?: Ref<Record<string, boolean>>
  /** What to ask for; null while the component isn't ready to query. */
  shape: Ref<Shape | null>
  /** Auto-refresh interval in seconds (0 = off; values under 60 are ignored). */
  refreshSec?: Ref<number>
  debounceMs?: number
}

/**
 * The query behind a data component (docs/data-layer.md): resolves params against the
 * dataset, debounces changes, caches through TanStack Query (identical queries across
 * components share one request), keeps the previous result while refetching, and
 * publishes its state for the component frame.
 */
export function useComponentQuery(options: ComponentQueryOptions) {
  const queryClient = useQueryClient()
  const datasets = useDatasets()
  const canvasDoc = useCanvasDocStore()
  const dataStore = useComponentDataStore()

  const dataset = computed(() => datasets.data.value?.find((d) => d.id === options.dataset.value))

  // Bumped by refresh(): re-resolves relative times ("now") and bypasses the server cache.
  const refreshTick = ref(0)
  let bypassCache = false

  // Filters (canvas → group → component) override the params they're bound to.
  const filters = useResolvedFilters({ componentId: () => options.componentId.value })
  const fromFilters = computed(() =>
    dataset.value
      ? paramsFromFilters(
          dataset.value,
          filters.value,
          options.bindings?.value ?? {},
          options.params.value,
        )
      : { params: {}, bound: [] },
  )

  const resolved = computed(() => {
    void refreshTick.value
    return dataset.value
      ? effectiveParams(dataset.value, { ...options.params.value, ...fromFilters.value.params })
      : {}
  })
  const missing = computed(() =>
    dataset.value ? missingRequired(dataset.value, resolved.value) : [],
  )

  const liveRequest = computed<QueryRequest | null>(() => {
    if (!dataset.value || !options.shape.value || missing.value.length) return null
    return {
      dataset: dataset.value.id,
      params: resolved.value,
      shape: options.shape.value,
      context: { canvasId: canvasDoc.canvas?.id, componentId: options.componentId.value },
    }
  })

  // Debounce: typing in the inspector shouldn't fire a query per keystroke.
  const request = ref<QueryRequest | null>(liveRequest.value)
  let timer: ReturnType<typeof setTimeout> | undefined
  watch(
    () => JSON.stringify(liveRequest.value),
    () => {
      clearTimeout(timer)
      timer = setTimeout(() => (request.value = liveRequest.value), options.debounceMs ?? 250)
    },
  )

  /** Cache key: the request without logging context (identical queries share results). */
  const queryKey = computed(() => {
    const r = request.value
    return ['query', r?.dataset, r?.params, r?.shape] as const
  })

  const query = useQuery(
    computed(() => ({
      queryKey: queryKey.value,
      queryFn: ({ signal }: { signal: AbortSignal }) => {
        const r = request.value!
        const cache = bypassCache ? 'refresh' : 'default'
        bypassCache = false
        return postQuery({ ...r, cache }, signal)
      },
      enabled: !!request.value,
      placeholderData: keepPreviousData,
      staleTime: 60_000,
      refetchInterval:
        (options.refreshSec?.value ?? 0) >= 60 ? options.refreshSec!.value * 1000 : false,
    })),
  )

  const result = computed<QueryResult | undefined>(() =>
    request.value ? query.data.value : undefined,
  )

  const state = computed<DataState>(() => {
    if (!options.dataset.value) return 'unconfigured'
    if (datasets.isPending.value) return 'loading'
    if (missing.value.length) return 'missing'
    if (query.isError.value && !query.isFetching.value) return 'error'
    if (!result.value) return 'loading'
    if (query.isPlaceholderData.value || (query.isFetching.value && !query.isPending.value)) {
      return 'refetching'
    }
    return result.value.meta.rowsReturned === 0 ? 'empty' : 'ready'
  })

  function refresh(): void {
    bypassCache = true
    refreshTick.value += 1
    // Applies immediately (no debounce) and refetches even if the key didn't change.
    request.value = liveRequest.value
    void queryClient.invalidateQueries({ queryKey: queryKey.value, exact: true })
  }

  watchEffect(() => {
    dataStore.publish(options.componentId.value, {
      state: state.value,
      fetching: query.isFetching.value,
      request: request.value,
      meta: result.value?.meta ?? null,
      error: (query.error.value as Error | null) ?? null,
      bindings: fromFilters.value.bound,
      refresh,
    })
  })

  onBeforeUnmount(() => {
    clearTimeout(timer)
    dataStore.remove(options.componentId.value)
  })

  return {
    dataset,
    params: resolved,
    missing,
    bindings: computed(() => fromFilters.value.bound),
    request,
    result,
    state,
    error: query.error,
    fetching: query.isFetching,
    refresh,
    retry: () => void query.refetch(),
  }
}
