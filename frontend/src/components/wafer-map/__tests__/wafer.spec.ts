import { describe, expect, it } from 'vitest'
import { colorScale, rampColor } from '@/components/wafer-map/colorScale'
import { cellPosition, dieAt, extentOf, layout } from '@/components/wafer-map/geometry'
import { SEQUENTIAL_BLUE } from '@/ui/vizPalette'

describe('colorScale', () => {
  const values = Array.from({ length: 101 }, (_, i) => i) // 0..100

  it('sequential: min–max or p1–p99, clamped at the ends', () => {
    const auto = colorScale(values, {
      palette: 'sequential',
      range: 'auto',
      rangeMin: null,
      rangeMax: null,
      center: null,
      dark: false,
    })
    expect([auto.min, auto.max]).toEqual([0, 100])
    expect(auto.color(0)).toBe(rampColor(SEQUENTIAL_BLUE, 0))
    expect(auto.color(-50)).toBe(auto.color(0))
    expect(auto.color(500)).toBe(auto.color(100))
    const p = colorScale(values, {
      palette: 'sequential',
      range: 'p1-p99',
      rangeMin: null,
      rangeMax: null,
      center: null,
      dark: false,
    })
    expect([p.min, p.max]).toEqual([1, 99])
  })

  it('fixed range and a degenerate range', () => {
    const fixed = colorScale(values, {
      palette: 'sequential',
      range: 'fixed',
      rangeMin: 10,
      rangeMax: 20,
      center: null,
      dark: false,
    })
    expect([fixed.min, fixed.max]).toEqual([10, 20])
    const flat = colorScale([5, 5, 5], {
      palette: 'sequential',
      range: 'auto',
      rangeMin: null,
      rangeMax: null,
      center: null,
      dark: false,
    })
    expect(flat.max).toBeGreaterThan(flat.min)
  })

  it('diverging: symmetric around the center, gray in the middle', () => {
    const d = colorScale(values, {
      palette: 'diverging',
      range: 'auto',
      rangeMin: null,
      rangeMax: null,
      center: 80,
      dark: false,
    })
    expect(d.center).toBe(80)
    expect([d.min, d.max]).toEqual([0, 160])
    expect(d.color(80)).toBe('rgb(240,239,236)')
  })
})

describe('geometry', () => {
  const dies = [
    { x: 0, y: 0, value: 1 },
    { x: 2, y: 0, value: 2 },
    { x: 1, y: 2, value: 3 },
  ]
  const extent = extentOf(dies)

  it('fits the grid and maps screen points back to dies', () => {
    expect(extent).toEqual({ xMin: 0, xMax: 2, yMin: 0, yMax: 2 })
    const l = layout(extent, 300, 300)
    expect(l.cell).toBeGreaterThan(80)
    const lookup = new Map(dies.map((d) => [`${d.x},${d.y}`, d]))
    for (const die of dies) {
      const { left, top } = cellPosition(die, extent, l, false, false)
      expect(dieAt(left + l.cell / 2, top + l.cell / 2, extent, l, false, false, lookup)).toBe(die)
    }
    // y grows upwards: die (1, 2) is in the top row.
    expect(cellPosition({ x: 1, y: 2 }, extent, l, false, false).top).toBeCloseTo(l.originY)
  })

  it('mirrors', () => {
    const l = layout(extent, 300, 300)
    const plain = cellPosition({ x: 0, y: 0 }, extent, l, false, false)
    const mirrored = cellPosition({ x: 0, y: 0 }, extent, l, true, true)
    expect(mirrored.left).toBeCloseTo(l.originX + 2 * l.cell)
    expect(mirrored.top).toBeCloseTo(l.originY)
    expect(plain.top).toBeCloseTo(l.originY + 2 * l.cell)
  })
})
