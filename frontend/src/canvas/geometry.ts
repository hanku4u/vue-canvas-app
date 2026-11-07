/** Canvas grid size in flow units (docs/canvas-ux.md: 16 px snap). */
export const GRID = 16

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 2

/** Default and minimum size for components until each type defines its own (F3 registry). */
export const DEFAULT_SIZE = { w: 320, h: 208 }
export const MIN_SIZE = { w: 160, h: 96 }

export function snap(value: number, grid = GRID): number {
  return Math.round(value / grid) * grid
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export function snapRect(rect: Rect, enabled: boolean): Rect {
  if (!enabled) return rect
  return {
    x: snap(rect.x),
    y: snap(rect.y),
    w: Math.max(MIN_SIZE.w, snap(rect.w)),
    h: Math.max(MIN_SIZE.h, snap(rect.h)),
  }
}
