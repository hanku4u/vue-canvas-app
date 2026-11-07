/** Die grid geometry for drawing and hit-testing a wafer map. */

export interface Die {
  x: number
  y: number
  value: number
}

export interface GridExtent {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

export interface Layout {
  /** Die cell size in CSS pixels. */
  cell: number
  /** Top-left of the die grid in CSS pixels. */
  originX: number
  originY: number
  /** Wafer outline circle in CSS pixels. */
  cx: number
  cy: number
  radius: number
}

export function extentOf(dies: Die[]): GridExtent {
  let xMin = Infinity
  let xMax = -Infinity
  let yMin = Infinity
  let yMax = -Infinity
  for (const d of dies) {
    if (d.x < xMin) xMin = d.x
    if (d.x > xMax) xMax = d.x
    if (d.y < yMin) yMin = d.y
    if (d.y > yMax) yMax = d.y
  }
  return dies.length ? { xMin, xMax, yMin, yMax } : { xMin: 0, xMax: 0, yMin: 0, yMax: 0 }
}

/**
 * Fit the die grid (plus a margin for the outline) into a width × height box. The outline
 * circle is fitted to the farthest die corner from the grid center.
 */
export function layout(extent: GridExtent, width: number, height: number, margin = 6): Layout {
  const cols = extent.xMax - extent.xMin + 1
  const rows = extent.yMax - extent.yMin + 1
  // The outline is ~sqrt(2)/2 of the diagonal larger than the grid for corner dies; a
  // round wafer's dies fill a circle, so allow ~4% extra around the grid.
  const span = Math.max(cols, rows) * 1.04
  const cell = Math.max(1, Math.min((width - 2 * margin) / span, (height - 2 * margin) / span))
  const gridW = cols * cell
  const gridH = rows * cell
  const originX = (width - gridW) / 2
  const originY = (height - gridH) / 2
  return {
    cell,
    originX,
    originY,
    cx: width / 2,
    cy: height / 2,
    radius: (Math.max(cols, rows) * cell * 1.02) / 2,
  }
}

/** Screen position (CSS px, top-left of the cell) of a die, with optional mirroring. */
export function cellPosition(
  die: { x: number; y: number },
  extent: GridExtent,
  l: Layout,
  flipX: boolean,
  flipY: boolean,
): { left: number; top: number } {
  const col = flipX ? extent.xMax - die.x : die.x - extent.xMin
  // Die y grows upwards (wafer coordinates); screen y grows downwards.
  const row = flipY ? die.y - extent.yMin : extent.yMax - die.y
  return { left: l.originX + col * l.cell, top: l.originY + row * l.cell }
}

/** The die under a screen point, from a lookup keyed by "x,y". */
export function dieAt<T>(
  px: number,
  py: number,
  extent: GridExtent,
  l: Layout,
  flipX: boolean,
  flipY: boolean,
  lookup: Map<string, T>,
): T | undefined {
  const col = Math.floor((px - l.originX) / l.cell)
  const row = Math.floor((py - l.originY) / l.cell)
  const x = flipX ? extent.xMax - col : extent.xMin + col
  const y = flipY ? extent.yMin + row : extent.yMax - row
  return lookup.get(`${x},${y}`)
}

/** Notch position on the outline (angle in radians, screen coordinates). */
export function notchAngle(notch: 'down' | 'up' | 'left' | 'right'): number {
  return { down: Math.PI / 2, up: -Math.PI / 2, left: Math.PI, right: 0 }[notch]
}
