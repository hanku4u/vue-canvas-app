import { Sheet } from '@lucide/vue'
import { lazyView } from '@/registry/lazy'
import type { ComponentDefinition } from '@/registry/types'
import TableInspector from './TableInspector.vue'
import TablePreview from './TablePreview.vue'
import { tableConfigSchema, type TableConfig } from './schema'

export const tableDefinition: ComponentDefinition<TableConfig> = {
  type: 'table',
  label: 'Table',
  description: 'A server-paged table with sorting, column filters and row selection.',
  icon: Sheet,
  defaultSize: { w: 672, h: 368 },
  minSize: { w: 320, h: 192 },
  configSchema: tableConfigSchema,
  configVersion: 1,
  defaultConfig: () => tableConfigSchema.parse({}),
  defaultTitle: () => 'Table',
  view: lazyView(() => import('./TableView.vue')),
  preview: TablePreview,
  inspector: TableInspector,
  dataKind: 'table',
}
