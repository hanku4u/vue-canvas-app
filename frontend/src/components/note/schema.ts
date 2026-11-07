import { z } from 'zod'

export const NOTE_COLORS = ['default', 'yellow', 'blue', 'green', 'red'] as const
export type NoteColor = (typeof NOTE_COLORS)[number]

export const noteConfigSchema = z.object({
  markdown: z
    .string()
    .max(20_000)
    .default('')
    // Edited inline on the canvas (double-click), not in the inspector.
    .meta({ title: 'Text', 'x-inspector': false }),
  color: z
    .enum(NOTE_COLORS)
    .default('yellow')
    .meta({
      title: 'Color',
      'x-widget': 'swatches',
      'x-swatches': Object.fromEntries(NOTE_COLORS.map((c) => [c, `var(--note-${c})`])),
    }),
  fontSize: z
    .enum(['sm', 'md', 'lg'])
    .default('md')
    .meta({
      title: 'Text size',
      'x-widget': 'segmented',
      'x-enum-labels': { sm: 'Small', md: 'Medium', lg: 'Large' },
    }),
})

export type NoteConfig = z.infer<typeof noteConfigSchema>
