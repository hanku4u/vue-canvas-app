import { z } from 'zod'
import { dataConfigFields } from '../shared/dataConfig'

export const dataPreviewConfigSchema = z.object({
  ...dataConfigFields,
  limit: z
    .number()
    .int()
    .min(10)
    .max(5000)
    .default(200)
    .meta({ title: 'Rows to show', description: 'The first N rows of the result (10–5000).' }),
})

export type DataPreviewConfig = z.infer<typeof dataPreviewConfigSchema>
