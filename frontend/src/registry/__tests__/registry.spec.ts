import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'
import { z } from 'zod'
import {
  applyConfigPatch,
  clearRegistry,
  getDefinition,
  paletteDefinitions,
  registerComponent,
  resolveConfig,
} from '@/registry/registry'
import type { ComponentDefinition } from '@/registry/types'

const View = defineComponent({ render: () => null })

// v2 renamed `size` (number) to `fontSize` (enum).
const schema = z.object({
  text: z.string().default(''),
  fontSize: z.enum(['sm', 'md', 'lg']).default('md'),
})
type Config = z.infer<typeof schema>

function definition(
  overrides: Partial<ComponentDefinition<Config>> = {},
): ComponentDefinition<Config> {
  return {
    type: 'demo',
    label: 'Demo',
    description: 'A demo type',
    icon: View,
    defaultSize: { w: 100, h: 100 },
    minSize: { w: 50, h: 50 },
    configSchema: schema,
    configVersion: 2,
    migrateConfig: (old, from) => {
      const value = old as { text?: string; size?: number }
      if (from === 1) return { text: value.text, fontSize: (value.size ?? 14) > 16 ? 'lg' : 'md' }
      return old
    },
    defaultConfig: () => schema.parse({}),
    view: View,
    ...overrides,
  }
}

afterEach(() => clearRegistry())

describe('registration', () => {
  it('registers, looks up and filters the palette', () => {
    registerComponent(definition())
    registerComponent(definition({ type: 'hidden', inPalette: false }))
    expect(getDefinition('demo')?.label).toBe('Demo')
    expect(paletteDefinitions().map((d) => d.type)).toEqual(['demo'])
  })

  it('rejects duplicate types', () => {
    registerComponent(definition())
    expect(() => registerComponent(definition())).toThrow(/already registered/)
  })
})

describe('resolveConfig', () => {
  const def = () => definition() as unknown as ComponentDefinition

  it('fills defaults for a current config', () => {
    expect(resolveConfig(def(), { config: { text: 'hi' }, configVersion: 2 })).toEqual({
      ok: true,
      config: { text: 'hi', fontSize: 'md' },
      migrated: false,
    })
  })

  it('migrates older configs', () => {
    const resolved = resolveConfig(def(), { config: { text: 'hi', size: 18 }, configVersion: 1 })
    expect(resolved).toEqual({ ok: true, config: { text: 'hi', fontSize: 'lg' }, migrated: true })
  })

  it('reports invalid configs and falls back to defaults', () => {
    const resolved = resolveConfig(def(), { config: { fontSize: 'huge' }, configVersion: 2 })
    expect(resolved).toMatchObject({
      ok: false,
      error: expect.stringMatching(/fontSize/),
      config: { text: '', fontSize: 'md' },
    })
  })

  it('refuses configs saved by a newer version', () => {
    const resolved = resolveConfig(def(), { config: {}, configVersion: 3 })
    expect(resolved.ok).toBe(false)
  })

  it('needs a migration for older versions', () => {
    const noMigration = definition({ migrateConfig: undefined }) as unknown as ComponentDefinition
    expect(resolveConfig(noMigration, { config: {}, configVersion: 1 }).ok).toBe(false)
  })
})

describe('applyConfigPatch', () => {
  it('validates the merged config', () => {
    const def = definition() as unknown as ComponentDefinition
    expect(applyConfigPatch(def, { text: 'a', fontSize: 'md' }, { fontSize: 'lg' })).toEqual({
      ok: true,
      config: { text: 'a', fontSize: 'lg' },
    })
    expect(applyConfigPatch(def, { text: 'a', fontSize: 'md' }, { fontSize: 'xl' }).ok).toBe(false)
  })
})
