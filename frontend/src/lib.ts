/**
 * The `fab-canvas` npm package, embeddable form (docs/packaging.md):
 *
 *   import { mountApp } from 'fab-canvas'
 *   mountApp('#fab-canvas', { apiBase: '/api', basePath: '/fab/' })
 *
 * The app owns its router, so give it a URL path of its own (`basePath`) and serve your
 * page for every path under it.
 */
import type { App } from 'vue'
import type { FabCanvasConfig } from './app/config'
import { createFabCanvasApp, installA11yFixes } from './app/createFabCanvasApp'

export type { FabCanvasConfig } from './app/config'
export type * from './api/types'
export type * from './api/adminTypes'

export interface MountedFabCanvas {
  /** The underlying Vue app (for advanced use). */
  app: App
  /** Remove the app from the page. */
  unmount: () => void
}

/** Mount Fab Canvas into an element (or selector). Returns a handle to unmount it. */
export function mountApp(target: string | Element, config: FabCanvasConfig = {}): MountedFabCanvas {
  const el = typeof target === 'string' ? document.querySelector(target) : target
  if (!el) throw new Error(`fab-canvas: no element matches ${String(target)}`)
  const app = createFabCanvasApp(config)
  app.mount(el)
  installA11yFixes(el as HTMLElement)
  return { app, unmount: () => app.unmount() }
}
