import { z } from 'zod'

/**
 * Converts a component's Zod config schema into form field descriptors for the generated
 * inspector form, via Zod's JSON Schema output. Field metadata comes from `.meta()`:
 *
 *   title / description     label and help text
 *   x-inspector: false      hide the field (edited elsewhere, e.g. inline)
 *   x-widget                'textarea' | 'segmented' | 'swatches'
 *   x-enum-labels           { value: label } for enum options
 *   x-swatches              { value: css color } for the 'swatches' widget
 *   x-order                 sort order (default: declaration order)
 */

export interface FieldOption {
  value: string
  label: string
  swatch?: string
}

interface BaseField {
  key: string
  label: string
  help?: string
}

export type InspectorField =
  | (BaseField & { kind: 'text'; multiline: boolean; maxLength?: number })
  | (BaseField & { kind: 'number'; integer: boolean; min?: number; max?: number; step?: number })
  | (BaseField & { kind: 'boolean' })
  | (BaseField & {
      kind: 'select'
      options: FieldOption[]
      widget: 'select' | 'segmented' | 'swatches'
    })
  | (BaseField & { kind: 'multiselect'; options: FieldOption[] })

interface JsonSchemaProperty {
  type?: string | string[]
  title?: string
  description?: string
  enum?: unknown[]
  items?: JsonSchemaProperty
  minimum?: number
  maximum?: number
  multipleOf?: number
  maxLength?: number
  'x-inspector'?: boolean
  'x-widget'?: string
  'x-enum-labels'?: Record<string, string>
  'x-swatches'?: Record<string, string>
  'x-order'?: number
}

function humanize(key: string): string {
  const spaced = key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase()
}

function options(prop: JsonSchemaProperty, values: unknown[]): FieldOption[] {
  return values.map((value) => {
    const v = String(value)
    return {
      value: v,
      label: prop['x-enum-labels']?.[v] ?? humanize(v),
      swatch: prop['x-swatches']?.[v],
    }
  })
}

function toField(key: string, prop: JsonSchemaProperty): InspectorField | null {
  const base: BaseField = { key, label: prop.title ?? humanize(key), help: prop.description }
  const type = Array.isArray(prop.type) ? prop.type.find((t) => t !== 'null') : prop.type

  if (prop.enum && (type === 'string' || type === undefined)) {
    const widget =
      prop['x-widget'] === 'segmented' || prop['x-widget'] === 'swatches'
        ? prop['x-widget']
        : 'select'
    return { ...base, kind: 'select', options: options(prop, prop.enum), widget }
  }
  switch (type) {
    case 'string':
      return {
        ...base,
        kind: 'text',
        multiline: prop['x-widget'] === 'textarea',
        maxLength: prop.maxLength,
      }
    case 'number':
    case 'integer':
      return {
        ...base,
        kind: 'number',
        integer: type === 'integer',
        min: prop.minimum,
        max: prop.maximum,
        step: prop.multipleOf,
      }
    case 'boolean':
      return { ...base, kind: 'boolean' }
    case 'array':
      if (prop.items?.enum) {
        return { ...base, kind: 'multiselect', options: options(prop.items, prop.items.enum) }
      }
      return null
    default:
      return null
  }
}

const cache = new WeakMap<z.ZodType, InspectorField[]>()

/** Form fields for a config schema (cached per schema). Unsupported shapes are skipped. */
export function inspectorFields(schema: z.ZodType): InspectorField[] {
  const cached = cache.get(schema)
  if (cached) return cached
  const json = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as {
    properties?: Record<string, JsonSchemaProperty>
  }
  // Explicit x-order values sort among default positions (declaration index) and win ties.
  const entries = Object.entries(json.properties ?? {})
    .map(([key, prop], index) => ({
      key,
      prop,
      index,
      order: prop['x-order'] ?? index,
      explicit: prop['x-order'] !== undefined,
    }))
    .filter(({ prop }) => prop['x-inspector'] !== false)
    .sort(
      (a, b) => a.order - b.order || Number(b.explicit) - Number(a.explicit) || a.index - b.index,
    )
  const fields = entries.flatMap(({ key, prop }) => {
    const field = toField(key, prop)
    return field ? [field] : []
  })
  cache.set(schema, fields)
  return fields
}
