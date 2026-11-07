/**
 * Data-visualization colors (validated with the dataviz skill's palette validator against
 * the app's chart surfaces: light #ffffff, dark #18181c; all checks pass, light mode
 * needs "relief" for three slots — charts always ship legends, tooltips and a table view).
 *
 * Rules: categorical hues are assigned in this fixed order and follow the entity (never
 * its rank); status colors are reserved for state and always come with an icon + label.
 */

export const CATEGORICAL = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
} as const

export const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
} as const

/** Sequential ramp (blue, light → dark) for magnitude, e.g. wafer map values. */
export const SEQUENTIAL_BLUE = [
  '#cde2fb',
  '#b7d3f6',
  '#9ec5f4',
  '#86b6ef',
  '#6da7ec',
  '#5598e7',
  '#3987e5',
  '#2a78d6',
  '#256abf',
  '#1c5cab',
  '#184f95',
  '#104281',
  '#0d366b',
]

/** Diverging blue ↔ red with a neutral gray midpoint (e.g. deviation from target). */
export const DIVERGING = {
  light: ['#1c5cab', '#3987e5', '#86b6ef', '#f0efec', '#f0a3a2', '#e34948', '#a82b2b'],
  dark: ['#5598e7', '#3987e5', '#1c5cab', '#383835', '#a83d3d', '#e66767', '#f0a3a2'],
}

export interface ChartTokens {
  text: string
  textMuted: string
  grid: string
  axis: string
  surface: string
  categorical: readonly string[]
}

export function chartTokens(dark: boolean): ChartTokens {
  return dark
    ? {
        text: '#f0efec',
        textMuted: '#a1a1aa',
        grid: '#2a2a30',
        axis: '#3f3f46',
        surface: '#18181c',
        categorical: CATEGORICAL.dark,
      }
    : {
        text: '#0f172a',
        textMuted: '#64748b',
        grid: '#eef1f5',
        axis: '#cbd5e1',
        surface: '#ffffff',
        categorical: CATEGORICAL.light,
      }
}

/**
 * Stable color slots per entity: the first time a value (e.g. chamber "C") is seen in a
 * scope it takes the next free slot and keeps it, so filtering never repaints survivors.
 * Past the eighth value, entities share the last slot (fold into "Other" upstream).
 */
export class ColorSlots {
  private slots = new Map<string, number>()

  slot(key: string): number {
    let slot = this.slots.get(key)
    if (slot === undefined) {
      slot = Math.min(this.slots.size, CATEGORICAL.light.length - 1)
      this.slots.set(key, slot)
    }
    return slot
  }

  /** Assign in sorted order first, so a fresh chart's colors don't depend on data order. */
  assign(keys: string[]): void {
    for (const key of [...keys].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
      this.slot(key)
    }
  }
}
