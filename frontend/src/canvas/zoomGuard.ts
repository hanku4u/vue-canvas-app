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
/** Zoom change per mouse-wheel notch (~100 px of scroll) with Ctrl/⌘ held: 5%. */
export const WHEEL_STEP = 1.05
/** Pixels of scroll that make one wheel notch; line-mode deltas are converted. */
const NOTCH_PX = 100
const LINE_PX = 33
/** Trackpad pinch: zoom ∝ gesture size (e^(-0.01·deltaY)). */
const PINCH_RATE = 0.01
/** Never more than this per event, whatever the device reports. */
const MAX_STEP = 1.25

/**
 * Zoom factor for a Ctrl/⌘ + wheel event.
 *
 * - **Mouse wheel with Ctrl/⌘ physically held** (`keyHeld`): proportional to the scroll
 *   distance, WHEEL_STEP per notch. Browsers often split one notch into several small
 *   events (smooth scrolling); a proportional rate gives the same total either way.
 * - **Trackpad pinch** (browsers report it as Ctrl+wheel without the key pressed): follows
 *   the gesture, PINCH_RATE per pixel.
 */
export function wheelZoomFactor(
  event: Pick<WheelEvent, 'deltaY' | 'deltaMode'>,
  keyHeld: boolean,
): number {
  const { deltaY, deltaMode } = event
  if (!deltaY) return 1
  const px = deltaMode === 1 ? deltaY * LINE_PX : deltaMode === 2 ? deltaY * NOTCH_PX * 3 : deltaY
  const factor =
    keyHeld || deltaMode !== 0 ? WHEEL_STEP ** (-px / NOTCH_PX) : Math.exp(-px * PINCH_RATE)
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

  // Whether Ctrl/⌘ is physically held: tells a mouse wheel zoom from a trackpad pinch.
  let keyHeld = false
  const trackKeys = (event: KeyboardEvent) => {
    keyHeld = event.ctrlKey || event.metaKey
  }
  const releaseKeys = () => {
    keyHeld = false
  }

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
    zoomAround(wheelZoomFactor(event, keyHeld), event.clientX - rect.left, event.clientY - rect.top)
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
    window.addEventListener('keydown', trackKeys, { capture: true })
    window.addEventListener('keyup', trackKeys, { capture: true })
    window.addEventListener('blur', releaseKeys)
    window.addEventListener('keydown', onKeydown, { capture: true })
    window.addEventListener('gesturestart', blockGesture, { passive: false })
    window.addEventListener('gesturechange', blockGesture, { passive: false })
  })
  onBeforeUnmount(() => {
    window.removeEventListener('wheel', onWheel, { capture: true })
    window.removeEventListener('keydown', trackKeys, { capture: true })
    window.removeEventListener('keyup', trackKeys, { capture: true })
    window.removeEventListener('blur', releaseKeys)
    window.removeEventListener('keydown', onKeydown, { capture: true })
    window.removeEventListener('gesturestart', blockGesture)
    window.removeEventListener('gesturechange', blockGesture)
  })
}
