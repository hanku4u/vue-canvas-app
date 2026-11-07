import type { CanvasComponent } from '@/api/types'
import type { ComponentConfig, ComponentDefinition, ConfigPatch, ResolvedConfig } from './types'

const definitions = new Map<string, ComponentDefinition>()

/** Register a component type. Registering the same type twice is a programming error. */
export function registerComponent<C extends ComponentConfig>(
  definition: ComponentDefinition<C>,
): void {
  if (definitions.has(definition.type)) {
    throw new Error(`Component type '${definition.type}' is already registered`)
  }
  definitions.set(definition.type, definition as unknown as ComponentDefinition)
}

export function getDefinition(type: string): ComponentDefinition | undefined {
  return definitions.get(type)
}

/** All registered definitions, in registration order. */
export function listDefinitions(): ComponentDefinition[] {
  return [...definitions.values()]
}

export function paletteDefinitions(): ComponentDefinition[] {
  return listDefinitions().filter((d) => d.inPalette !== false)
}

/** Test helper: forget all registrations. */
export function clearRegistry(): void {
  definitions.clear()
}

function formatIssues(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  return error.issues
    .map(
      (issue) => (issue.path.length ? `${issue.path.map(String).join('.')}: ` : '') + issue.message,
    )
    .join('; ')
}

/**
 * Turn a stored component's config into a valid config for its type: migrate older config
 * versions, then validate (filling defaults). On failure, returns the type's default config
 * plus an error so the UI can say what's wrong instead of crashing.
 */
export function resolveConfig(
  definition: ComponentDefinition,
  component: Pick<CanvasComponent, 'config' | 'configVersion'>,
): ResolvedConfig {
  let raw: unknown = component.config
  const migrated = component.configVersion < definition.configVersion
  if (migrated) {
    if (!definition.migrateConfig) {
      return {
        ok: false,
        error: `No migration from config version ${component.configVersion} to ${definition.configVersion}`,
        config: definition.defaultConfig(),
      }
    }
    try {
      raw = definition.migrateConfig(raw, component.configVersion)
    } catch (error) {
      return {
        ok: false,
        error: `Migration failed: ${String(error)}`,
        config: definition.defaultConfig(),
      }
    }
  } else if (component.configVersion > definition.configVersion) {
    return {
      ok: false,
      error: `Saved with a newer version of this component (v${component.configVersion}). Reload the app.`,
      config: definition.defaultConfig(),
    }
  }
  const parsed = definition.configSchema.safeParse(raw)
  return parsed.success
    ? { ok: true, config: parsed.data, migrated }
    : { ok: false, error: formatIssues(parsed.error), config: definition.defaultConfig() }
}

/** Validate `current + patch` for a type. Returns the new config or an error message. */
export function applyConfigPatch(
  definition: ComponentDefinition,
  current: ComponentConfig,
  patch: ConfigPatch,
): { ok: true; config: ComponentConfig } | { ok: false; error: string } {
  const parsed = definition.configSchema.safeParse({ ...current, ...patch })
  return parsed.success
    ? { ok: true, config: parsed.data }
    : { ok: false, error: formatIssues(parsed.error) }
}
