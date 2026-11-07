import { ChartLine } from '@lucide/vue'
import type { ComponentDefinition } from '@/registry/types'
import ChartInspector from './ChartInspector.vue'
import ChartPreview from './ChartPreview.vue'
import ChartView from './ChartView.vue'
import { chartConfigSchema, type ChartConfig } from './schema'

export const chartDefinition: ComponentDefinition<ChartConfig> = {
  type: 'chart',
  label: 'Chart',
  description: 'Trend, scatter, histogram, box plot or SPC control chart.',
  icon: ChartLine,
  defaultSize: { w: 640, h: 352 },
  minSize: { w: 288, h: 192 },
  configSchema: chartConfigSchema,
  configVersion: 1,
  defaultConfig: () => chartConfigSchema.parse({}),
  defaultTitle: () => 'Chart',
  view: ChartView,
  preview: ChartPreview,
  inspector: ChartInspector,
  dataKind: 'chart',
}
