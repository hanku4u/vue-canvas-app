import { onBeforeUnmount, onMounted, type Ref } from 'vue'
import type { ViewportTransform } from '@vue-flow/core'

/**
 * Keep zoom gestures on the canvas page from zooming the browser (docs/canvas-ux.md,
 * Navigation). Browsers deliver trackpad pinch as Ctrl+wheel, and Vue Flow only gets the
 * events that land on the bare canvas, so a pinch over an active chart, a side panel or
 * the filter bar (or one that drifts there mid-gesture) used to zoom the whole page.
 *
 * On this page the app owns Ctrl/⌘+wheel, pinch and Ctrl/⌘ +/−/0:
 * - over the canvas area (components included) they zoom the canvas around the pointer;
 * - anywhere else (panels, full screen, dialogs) they're blocked, doing nothing.
 * Browser zoom stays available from the browser menu, and on every other page.
 */
/** Zoom change per mouse-wheel notch (Ctrl/⌘ + wheel): 10%. */
export const WHEEL_STEP = 1.1
/** Trackpad pinch: zoom ∝ gesture size (e^(-0.01·deltaY)); a typical event is 1–5%. */
const PINCH_RATE = 0.01
/** Never more than this per event, whatever the device reports. */
const MAX_STEP = 1.25

/**
 * Zoom factor for a Ctrl/⌘ + wheel event. Mouse wheels report large, coarse deltas per
 * notch (~100 px, or 1–3 lines); trackpad pinches report many small ones. Treating both
 * with one formula makes either the wheel jumpy or the pinch sluggish, so:
 * - wheel notches (line/page mode, or pixel deltas ≥ 50) step by WHEEL_STEP per notch;
 * - small pixel deltas (pinch, smooth scrolling) scale continuously with the gesture.
 */
export function wheelZoomFactor(event: Pick<WheelEvent, 'deltaY' | 'deltaMode'>): number {
  const { deltaY, deltaMode } = event
  if (!deltaY) return 1
  const notch = deltaMode !== 0 || Math.abs(deltaY) >= 50
  const factor = notch ? WHEEL_STEP ** (deltaY < 0 ? 1 : -1) : Math.exp(-deltaY * PINCH_RATE)
  return Math.min(MAX_STEP, Math.max(1 / MAX_STEP, factor))
}

export function useCanvasZoomGuard(options: {
  container: Ref<HTMLElement | null>
  viewport: Ref<ViewportTransform>
  setViewport: (v: ViewportTransform) => unknown
  minZoom: number
  maxZoom: number
  /** False while something covers the canvas (e.g. full screen): block only. */
  canvasActive: () => boolean
}): void {
  const clamp = (k: number) => Math.min(options.maxZoom, Math.max(options.minZoom, k))

  function overCanvas(event: { clientX: number; clientY: number; target: EventTarget | null }) {
    const el = options.container.value
    if (!el || !options.canvasActive()) return null
    const target = event.target instanceof Element ? event.target : null
    // Overlays inside the canvas area that aren't the canvas itself.
    if (target?.closest('.n-modal, .v-binder-follower-content, [role="dialog"]')) return null
    const rect = el.getBoundingClientRect()
    const inside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    return inside && target && el.contains(target) ? rect : null
  }

  /** Zoom by `factor` keeping the screen point (px, py), relative to the canvas, fixed. */
  function zoomAround(factor: number, px: number, py: number): void {
    const { x, y, zoom } = options.viewport.value
    const next = clamp(zoom * factor)
    if (next === zoom) return
    const ratio = next / zoom
    void options.setViewport({ x: px - (px - x) * ratio, y: py - (py - y) * ratio, zoom: next })
  }

  function onWheel(event: WheelEvent): void {
    if (!event.ctrlKey && !event.metaKey) return
    // Never let the browser zoom the page here, and keep Vue Flow from zooming twice.
    event.preventDefault()
    event.stopPropagation()
    const rect = overCanvas(event)
    if (!rect) return
    zoomAround(wheelZoomFactor(event), event.clientX - rect.left, event.clientY - rect.top)
  }

  /** Ctrl/⌘ + = / + / − zoom the canvas around its center (Ctrl/⌘ 0 is a canvas shortcut). */
  function onKeydown(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return
    const zoomIn = event.key === '=' || event.key === '+'
    const zoomOut = event.key === '-' || event.key === '_'
    if (!zoomIn && !zoomOut) return
    event.preventDefault()
    const el = options.container.value
    if (!el || !options.canvasActive()) return
    const rect = el.getBoundingClientRect()
    zoomAround(zoomIn ? 1.2 : 1 / 1.2, rect.width / 2, rect.height / 2)
  }

  // Safari's own pinch events (it doesn't send Ctrl+wheel for every gesture).
  const blockGesture = (event: Event) => event.preventDefault()

  onMounted(() => {
    window.addEventListener('wheel', onWheel, { passive: false, capture: true })
    window.addEventListener('keydown', onKeydown, { capture: true })
    window.addEventListener('gesturestart', blockGesture, { passive: false })
    window.addEventListener('gesturechange', blockGesture, { passive: false })
  })
  onBeforeUnmount(() => {
    window.removeEventListener('wheel', onWheel, { capture: true })
    window.removeEventListener('keydown', onKeydown, { capture: true })
    window.removeEventListener('gesturestart', blockGesture)
    window.removeEventListener('gesturechange', blockGesture)
  })
}
