import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { noteConfigSchema } from '@/components/note/schema'
import { inspectorFields } from '@/registry/inspectorFields'

describe('inspectorFields', () => {
  it('builds the note form: hidden markdown, swatches and segmented sizes', () => {
    const fields = inspectorFields(noteConfigSchema)
    expect(fields.map((f) => f.key)).toEqual(['color', 'fontSize'])
    expect(fields[0]).toMatchObject({
      kind: 'select',
      widget: 'swatches',
      label: 'Color',
      options: expect.arrayContaining([
        { value: 'yellow', label: 'Yellow', swatch: 'var(--note-yellow)' },
      ]),
    })
    expect(fields[1]).toMatchObject({
      kind: 'select',
      widget: 'segmented',
      options: [
        { value: 'sm', label: 'Small' },
        { value: 'md', label: 'Medium' },
        { value: 'lg', label: 'Large' },
      ],
    })
  })

  it('maps scalar types, labels, help and ordering', () => {
    const schema = z.object({
      pointBudget: z.number().int().min(100).max(10_000).default(2000),
      showLegend: z.boolean().default(true).meta({ title: 'Legend', 'x-order': 0 }),
      query: z.string().default('').meta({ 'x-widget': 'textarea', description: 'SQL-ish' }),
      columns: z.array(z.enum(['lot_id', 'wafer_id'])).default([]),
      nested: z.object({ a: z.string() }).optional(),
    })
    const fields = inspectorFields(schema)
    expect(fields.map((f) => f.key)).toEqual(['showLegend', 'pointBudget', 'query', 'columns'])
    expect(fields).toEqual([
      { key: 'showLegend', label: 'Legend', help: undefined, kind: 'boolean' },
      {
        key: 'pointBudget',
        label: 'Point budget',
        help: undefined,
        kind: 'number',
        integer: true,
        min: 100,
        max: 10_000,
        step: undefined,
      },
      {
        key: 'query',
        label: 'Query',
        help: 'SQL-ish',
        kind: 'text',
        multiline: true,
        maxLength: undefined,
      },
      {
        key: 'columns',
        label: 'Columns',
        help: undefined,
        kind: 'multiselect',
        options: [
          { value: 'lot_id', label: 'Lot id', swatch: undefined },
          { value: 'wafer_id', label: 'Wafer id', swatch: undefined },
        ],
      },
    ])
  })
})
