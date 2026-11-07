import { z } from 'zod'
import { dataConfigFields } from '../shared/dataConfig'

export const tableColumnSchema = z.object({
  name: z.string(),
  visible: z.boolean().default(true),
  width: z.number().positive().optional(),
  pinned: z.enum(['left', 'right']).nullable().optional(),
})

export const publishRuleSchema = z.object({
  /** Column whose values are published, e.g. "lot_id". */
  column: z.string(),
  /** Filter dimension that receives them, e.g. "lot_id". */
  dimension: z.string(),
})

export const tableConfigSchema = z.object({
  ...dataConfigFields,
  /** Column order, visibility, width and pinning (edited in the grid and inspector). */
  columns: z.array(tableColumnSchema).default([]).meta({ 'x-inspector': false }),
  sort: z
    .array(z.object({ column: z.string(), dir: z.enum(['asc', 'desc']) }))
    .default([])
    .meta({ 'x-inspector': false }),
  /** AG Grid filter model (text / number / date, one condition per column). */
  filterModel: z.record(z.string(), z.unknown()).default({}).meta({ 'x-inspector': false }),
  /** Row selection publishes these columns' values into filters (wired in F10). */
  publish: z.array(publishRuleSchema).default([]).meta({ 'x-inspector': false }),
  selection: z
    .enum(['none', 'single', 'multiple'])
    .default('multiple')
    .meta({
      title: 'Row selection',
      'x-widget': 'segmented',
      'x-enum-labels': { none: 'None', single: 'Single', multiple: 'Multiple' },
    }),
  pageSize: z
    .number()
    .int()
    .min(50)
    .max(1000)
    .default(200)
    .meta({
      title: 'Rows per request',
      description: 'How many rows are loaded at a time while scrolling.',
    }),
  decimals: z
    .number()
    .int()
    .min(0)
    .max(8)
    .default(4)
    .meta({ title: 'Decimals', description: 'Maximum decimals shown for numbers.' }),
})

export type TableConfig = z.infer<typeof tableConfigSchema>
export type TableColumn = z.infer<typeof tableColumnSchema>
export type PublishRule = z.infer<typeof publishRuleSchema>
