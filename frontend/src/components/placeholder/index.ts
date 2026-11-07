import { z } from 'zod'
import { SquareDashed } from '@lucide/vue'
import type { ComponentDefinition } from '@/registry/types'
import PlaceholderPreview from './PlaceholderPreview.vue'
import PlaceholderView from './PlaceholderView.vue'

const placeholderConfigSchema = z.object({})

/**
 * A stand-in box for layout and performance testing (and seeded demo slots until the data
 * components exist). Not offered in the palette.
 */
export const placeholderDefinition: ComponentDefinition<z.infer<typeof placeholderConfigSchema>> = {
  type: 'placeholder',
  label: 'Placeholder',
  description: 'An empty box for layout testing.',
  icon: SquareDashed,
  defaultSize: { w: 320, h: 208 },
  minSize: { w: 160, h: 96 },
  configSchema: placeholderConfigSchema,
  configVersion: 1,
  defaultConfig: () => ({}),
  view: PlaceholderView,
  preview: PlaceholderPreview,
  inPalette: false,
}
