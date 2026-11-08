// Entry point for development (npm run dev) and the prebuilt app in the npm package.
import type { FabCanvasConfig } from './app/config'
import { createFabCanvasApp, installA11yFixes } from './app/createFabCanvasApp'

async function enableMocking(): Promise<void> {
  if (import.meta.env.VITE_API_MOCK !== '1') return
  const { startMockApi } = await import('./mocks/browser')
  await startMockApi()
}

/**
 * The prebuilt app reads `config.json` next to index.html (docs/packaging.md). The URL
 * path it's served under comes from `<base href>` unless config.json sets `basePath`.
 */
async function loadRuntimeConfig(): Promise<FabCanvasConfig> {
  if (import.meta.env.DEV) return {}
  const basePath = new URL(document.baseURI).pathname
  try {
    const response = await fetch(new URL('config.json', document.baseURI), { cache: 'no-store' })
    const config = response.ok ? ((await response.json()) as FabCanvasConfig) : {}
    return { basePath, ...config }
  } catch {
    return { basePath }
  }
}

async function bootstrap(): Promise<void> {
  await enableMocking()
  const app = createFabCanvasApp(await loadRuntimeConfig())
  app.mount('#app')
  installA11yFixes()
}

void bootstrap()
