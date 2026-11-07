import type { ViewportTransform } from '@vue-flow/core'

const key = (canvasId: string) => `canvas.viewport.${canvasId}`

/** The last viewport the user had on a canvas (per browser), or null. */
export function loadViewport(canvasId: string): ViewportTransform | null {
  try {
    const raw = localStorage.getItem(key(canvasId))
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<ViewportTransform>
    if ([value.x, value.y, value.zoom].every((n) => typeof n === 'number' && Number.isFinite(n))) {
      return value as ViewportTransform
    }
  } catch {
    // Unavailable or corrupt: fall back to fitting the canvas.
  }
  return null
}

export function saveViewport(canvasId: string, viewport: ViewportTransform): void {
  try {
    const { x, y, zoom } = viewport
    localStorage.setItem(key(canvasId), JSON.stringify({ x, y, zoom }))
  } catch {
    // Not persisted; harmless.
  }
}
