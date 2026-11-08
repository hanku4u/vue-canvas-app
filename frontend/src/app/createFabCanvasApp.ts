import { createApp, type App } from 'vue'
import { createPinia } from 'pinia'
import { VueQueryPlugin } from '@tanstack/vue-query'
import App_ from '@/App.vue'
import { createAppRouter } from '@/router'
import { installA11yFixes } from './a11yFixes'
import { initColorScheme } from './colorScheme'
import { configure, type FabCanvasConfig } from './config'
import { queryClient } from './queryClient'
import './styles.css'

let naiveStyleMeta = false

/**
 * Create the Fab Canvas Vue app (not yet mounted). Used by the dev entry (main.ts), the
 * prebuilt app and `mountApp()` in the npm package.
 */
export function createFabCanvasApp(config: FabCanvasConfig = {}): App {
  const resolved = configure(config)
  initColorScheme()

  // Naive UI injects its styles at runtime; this meta tag keeps them ahead of app CSS
  // so our own stylesheets can override component styles where needed.
  if (!naiveStyleMeta) {
    const meta = document.createElement('meta')
    meta.name = 'naive-ui-style'
    document.head.prepend(meta)
    naiveStyleMeta = true
  }

  const app = createApp(App_)
  app.use(createPinia())
  app.use(createAppRouter(resolved.basePath))
  app.use(VueQueryPlugin, { queryClient })
  return app
}

export { installA11yFixes }
