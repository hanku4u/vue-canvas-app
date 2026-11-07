import { DIVERGING, SEQUENTIAL_BLUE } from '@/ui/vizPalette'

/**
 * Wafer map color scales (dataviz rules): sequential = one hue, light → dark, for
 * magnitude; diverging = two hues with a neutral gray midpoint, for deviation from a
 * center. Values outside the range are clamped (and flagged in the legend).
 */

export interface ColorScale {
  min: number
  max: number
  center: number | null
  color: (value: number) => string
  /** Colors for the legend bar, low → high. */
  stops: string[]
}

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  const c = (x: number, y: number) => Math.round(x + (y - x) * t)
  return `rgb(${c(ar, br)},${c(ag, bg)},${c(ab, bb)})`
}

/** Interpolate along a ramp for t in [0, 1]. */
export function rampColor(ramp: readonly string[], t: number): string {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0))
  const pos = clamped * (ramp.length - 1)
  const i = Math.min(ramp.length - 2, Math.floor(pos))
  return mix(ramp[i]!, ramp[i + 1]!, pos - i)
}

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return Number.NaN
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo)
}

export interface ScaleOptions {
  palette: 'sequential' | 'diverging'
  range: 'auto' | 'p1-p99' | 'fixed'
  rangeMin: number | null
  rangeMax: number | null
  center: number | null
  dark: boolean
}

export function colorScale(values: number[], options: ScaleOptions): ColorScale {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  let min = sorted[0] ?? 0
  let max = sorted[sorted.length - 1] ?? 1
  if (options.range === 'p1-p99' && sorted.length > 20) {
    min = quantile(sorted, 0.01)
    max = quantile(sorted, 0.99)
  } else if (options.range === 'fixed') {
    min = options.rangeMin ?? min
    max = options.rangeMax ?? max
  }
  if (max <= min) max = min + 1

  if (options.palette === 'sequential') {
    const ramp = SEQUENTIAL_BLUE
    return {
      min,
      max,
      center: null,
      color: (v) => rampColor(ramp, (v - min) / (max - min)),
      stops: ramp,
    }
  }

  // Diverging: symmetric around the center, so equal deviations get equal intensity.
  const center = options.center ?? quantile(sorted, 0.5)
  const half = Math.max(center - min, max - center) || 1
  const ramp = options.dark ? DIVERGING.dark : DIVERGING.light
  return {
    min: center - half,
    max: center + half,
    center,
    color: (v) => rampColor(ramp, 0.5 + (v - center) / (2 * half)),
    stops: ramp,
  }
}
