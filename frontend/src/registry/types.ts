import type { Component } from 'vue'
import type { z } from 'zod'
import type { CanvasComponent, ComponentKind } from '@/api/types'

export type ComponentConfig = Record<string, unknown>

/**
 * Everything the app needs to know about one component type (docs/architecture.md,
 * "Component registry"). Palette, inspector, canvas rendering and config validation are
 * all driven from these definitions.
 */
export interface ComponentDefinition<C extends ComponentConfig = ComponentConfig> {
  /** Stable id stored on every component, e.g. "note". */
  type: string
  label: string
  description: string
  icon: Component
  defaultSize: { w: number; h: number }
  minSize: { w: number; h: number }
  /** Validates stored config. Field metadata (.meta) drives the generated inspector form. */
  configSchema: z.ZodType<C>
  /** Bump when the config shape changes, and handle the old shape in migrateConfig. */
  configVersion: number
  migrateConfig?: (config: unknown, fromVersion: number) => unknown
  defaultConfig: () => C
  /** Title for a newly added component. */
  defaultTitle?: (config: C) => string
  /** Full interactive view. Receives ComponentViewProps. */
  view: Component
  /** Cheap view for zoomed-out rendering. Falls back to `view`. */
  preview?: Component
  /** Extra inspector section below the generated settings form. Receives ComponentViewProps. */
  inspector?: Component
  /** Shown in the palette (default true). */
  inPalette?: boolean
  /**
   * Set for data components: the kind datasets declare in `suits`. The inspector then shows
   * the dataset picker and parameter form, and config must include `dataset` and `params`.
   */
  dataKind?: ComponentKind
}

/** Props passed to a definition's view, preview and inspector components. */
export interface ComponentViewProps<C extends ComponentConfig = ComponentConfig> {
  component: CanvasComponent
  config: C
  editable: boolean
  /** The component is active: its body receives wheel and drag events (docs/canvas-ux.md). */
  active: boolean
}

/** Emitted by views and inspectors to change config; validated before it is applied. */
export type ConfigPatch<C extends ComponentConfig = ComponentConfig> = Partial<C>

export type ResolvedConfig<C extends ComponentConfig = ComponentConfig> =
  { ok: true; config: C; migrated: boolean } | { ok: false; error: string; config: C }
