import { CircleDot } from '@lucide/vue'
import type { ComponentDefinition } from '@/registry/types'
import WaferMapPreview from './WaferMapPreview.vue'
import WaferMapView from './WaferMapView.vue'
import { waferMapConfigSchema, type WaferMapConfig } from './schema'

export const waferMapDefinition: ComponentDefinition<WaferMapConfig> = {
  type: 'wafer-map',
  label: 'Wafer map',
  description: 'Die-level values on the wafer: one wafer, a gallery, or stacked.',
  icon: CircleDot,
  defaultSize: { w: 640, h: 480 },
  minSize: { w: 240, h: 240 },
  configSchema: waferMapConfigSchema,
  configVersion: 1,
  defaultConfig: () => waferMapConfigSchema.parse({ dataset: 'wafer_dies' }),
  defaultTitle: () => 'Wafer map',
  view: WaferMapView,
  preview: WaferMapPreview,
  dataKind: 'wafer-map',
}
