import { getDefinition, registerComponent } from '@/registry/registry'
import type { ComponentConfig, ComponentDefinition } from '@/registry/types'
import { dataPreviewDefinition } from './data-preview'
import { noteDefinition } from './note'
import { placeholderDefinition } from './placeholder'
import { tableDefinition } from './table'

/**
 * Built-in component types, in palette order. Adding a type = a folder under
 * src/components/ with an index.ts exporting its definition, plus one line here.
 */
const builtIns: ComponentDefinition<ComponentConfig>[] = [
  noteDefinition as unknown as ComponentDefinition<ComponentConfig>,
  tableDefinition as unknown as ComponentDefinition<ComponentConfig>,
  dataPreviewDefinition as unknown as ComponentDefinition<ComponentConfig>,
  placeholderDefinition as unknown as ComponentDefinition<ComponentConfig>,
]

/** Register the built-in component types (idempotent). */
export function registerBuiltInComponents(): void {
  for (const definition of builtIns) {
    if (!getDefinition(definition.type)) registerComponent(definition)
  }
}
