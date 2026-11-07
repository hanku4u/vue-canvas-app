import { z } from 'zod'
import { dataConfigFields } from '../shared/dataConfig'
import { publishRuleSchema } from '../table/schema'

export const waferMapConfigSchema = z.object({
  ...dataConfigFields,
  mode: z
    .enum(['single', 'gallery', 'stacked'])
    .default('gallery')
    .meta({
      title: 'Show',
      'x-order': 0,
      'x-widget': 'segmented',
      'x-enum-labels': { single: 'One wafer', gallery: 'All wafers', stacked: 'Stacked' },
    }),
  /** Numeric column to color by ('' = the "value" column, or the first number). */
  value: z.string().default('').meta({ 'x-inspector': false }),
  aggregate: z
    .enum(['mean', 'median', 'std', 'min', 'max', 'count'])
    .default('mean')
    .meta({
      title: 'Per-die aggregate',
      description: 'For stacked maps, and dies with several measurements.',
      'x-order': 1,
      'x-enum-labels': {
        mean: 'Mean',
        median: 'Median',
        std: 'Std. deviation',
        min: 'Minimum',
        max: 'Maximum',
        count: 'Count',
      },
    }),
  palette: z
    .enum(['sequential', 'diverging'])
    .default('sequential')
    .meta({
      title: 'Colors',
      'x-order': 2,
      'x-widget': 'segmented',
      'x-enum-labels': { sequential: 'Low → high', diverging: 'Around a center' },
    }),
  range: z
    .enum(['auto', 'p1-p99', 'fixed'])
    .default('p1-p99')
    .meta({
      title: 'Color range',
      description: 'p1–p99 ignores the most extreme 1% at each end.',
      'x-order': 3,
      'x-widget': 'segmented',
      'x-enum-labels': { auto: 'Min–max', 'p1-p99': 'p1–p99', fixed: 'Fixed' },
    }),
  rangeMin: z.number().nullable().default(null).meta({ title: 'Range min (fixed)', 'x-order': 4 }),
  rangeMax: z.number().nullable().default(null).meta({ title: 'Range max (fixed)', 'x-order': 5 }),
  center: z.number().nullable().default(null).meta({
    title: 'Center (diverging)',
    description: 'E.g. the target. Empty = the median.',
    'x-order': 6,
  }),
  notch: z
    .enum(['down', 'up', 'left', 'right'])
    .default('down')
    .meta({ title: 'Notch', 'x-order': 7, 'x-widget': 'segmented' }),
  flipX: z.boolean().default(false).meta({ title: 'Mirror horizontally', 'x-order': 8 }),
  flipY: z.boolean().default(false).meta({ title: 'Mirror vertically', 'x-order': 9 }),
  showGrid: z.boolean().default(false).meta({ title: 'Die grid lines', 'x-order': 10 }),
  showOutline: z.boolean().default(true).meta({ title: 'Wafer outline', 'x-order': 11 }),
  /** Clicking a wafer (gallery) or die publishes these columns into filters (wired in F10). */
  publish: z.array(publishRuleSchema).default([]).meta({ 'x-inspector': false }),
})

export type WaferMapConfig = z.infer<typeof waferMapConfigSchema>
