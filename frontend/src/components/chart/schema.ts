import { z } from 'zod'
import { dataConfigFields } from '../shared/dataConfig'
import { publishRuleSchema } from '../table/schema'

export const CHART_KINDS = ['line', 'scatter', 'histogram', 'boxplot', 'spc'] as const
export type ChartKind = (typeof CHART_KINDS)[number]

/** Column fields: '' means "pick automatically from the dataset" (see fields.ts). */
export const chartConfigSchema = z.object({
  ...dataConfigFields,
  kind: z
    .enum(CHART_KINDS)
    .default('line')
    .meta({
      title: 'Chart type',
      'x-order': 0,
      'x-enum-labels': {
        line: 'Trend (line)',
        scatter: 'Scatter',
        histogram: 'Histogram',
        boxplot: 'Box plot',
        spc: 'SPC control chart',
      },
    }),
  x: z.string().default('').meta({ 'x-inspector': false }),
  y: z.array(z.string()).default([]).meta({ 'x-inspector': false }),
  seriesBy: z.string().default('').meta({ 'x-inspector': false }),
  groupBy: z.string().default('').meta({ 'x-inspector': false }),
  /** SPC limit columns ('' = auto by name, '-' = none). */
  limits: z
    .object({
      ucl: z.string().default(''),
      lcl: z.string().default(''),
      target: z.string().default(''),
      usl: z.string().default(''),
      lsl: z.string().default(''),
    })
    .default({ ucl: '', lcl: '', target: '', usl: '', lsl: '' })
    .meta({ 'x-inspector': false }),
  bins: z
    .number()
    .int()
    .min(0)
    .max(200)
    .default(0)
    .meta({ title: 'Histogram bins', description: '0 = automatic.', 'x-order': 20 }),
  yLog: z.boolean().default(false).meta({ title: 'Logarithmic y axis', 'x-order': 30 }),
  legend: z.boolean().default(true).meta({ title: 'Legend', 'x-order': 31 }),
  /** Clicking a point publishes these columns into filters (wired in F10). */
  publish: z.array(publishRuleSchema).default([]).meta({ 'x-inspector': false }),
  /** Brushing a time range publishes it as the time_range filter (wired in F10). */
  publishTimeRange: z.boolean().default(false).meta({
    title: 'Zooming sets the time range',
    description: 'Box-zoom on a time axis also sets the time range filter for this scope.',
    'x-order': 40,
  }),
})

export type ChartConfig = z.infer<typeof chartConfigSchema>
