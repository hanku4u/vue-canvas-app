import { z } from 'zod'

/**
 * Config fields shared by every data component (docs/components.md#data-binding-data-components).
 * `dataset` and `params` are edited by the data source section of the inspector, not the
 * generated form. Filter bindings and publishing are added in F10.
 */
export const dataConfigFields = {
  dataset: z.string().default('').meta({ 'x-inspector': false }),
  params: z.record(z.string(), z.unknown()).default({}).meta({ 'x-inspector': false }),
  refresh: z
    .enum(['off', '60', '300', '900'])
    .default('off')
    .meta({
      title: 'Auto-refresh',
      'x-order': 100,
      'x-enum-labels': {
        off: 'Off',
        '60': 'Every minute',
        '300': 'Every 5 minutes',
        '900': 'Every 15 minutes',
      },
    }),
}

export function refreshSeconds(value: string): number {
  return value === 'off' ? 0 : Number(value)
}
