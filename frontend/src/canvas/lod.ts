import { computed, inject, provide, type ComputedRef, type InjectionKey, type Ref } from 'vue'

/** Below this zoom, components render their preview instead of the full view. */
export const PREVIEW_BELOW_ZOOM = 0.5
/** Below this zoom, text-only content (notes) is hidden; only the frame and color remain. */
export const TINY_BELOW_ZOOM = 0.3

export type LevelOfDetail = 'full' | 'preview'

const LOD_KEY: InjectionKey<ComputedRef<LevelOfDetail>> = Symbol('canvas-lod')

/** Provide level of detail to all components on the canvas, derived from the zoom. */
export function provideLevelOfDetail(zoom: Ref<number>): ComputedRef<LevelOfDetail> {
  const lod = computed<LevelOfDetail>(() => (zoom.value < PREVIEW_BELOW_ZOOM ? 'preview' : 'full'))
  provide(LOD_KEY, lod)
  return lod
}

export function useLevelOfDetail(): ComputedRef<LevelOfDetail> {
  return inject(
    LOD_KEY,
    computed(() => 'full'),
  )
}
