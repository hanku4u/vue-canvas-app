import { Table2 } from '@lucide/vue'
import { lazyView } from '@/registry/lazy'
import type { ComponentDefinition } from '@/registry/types'
import { dataPreviewConfigSchema, type DataPreviewConfig } from './schema'

export const dataPreviewDefinition: ComponentDefinition<DataPreviewConfig> = {
  type: 'data-preview',
  label: 'Data preview',
  description: 'The raw first rows of any dataset, for exploring data.',
  icon: Table2,
  defaultSize: { w: 576, h: 320 },
  minSize: { w: 240, h: 160 },
  configSchema: dataPreviewConfigSchema,
  configVersion: 1,
  defaultConfig: () => dataPreviewConfigSchema.parse({}),
  defaultTitle: () => 'Data preview',
  view: lazyView(() => import('./DataPreviewView.vue')),
  dataKind: 'data-preview',
}
