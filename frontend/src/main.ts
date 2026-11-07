import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { VueQueryPlugin } from '@tanstack/vue-query'

import App from './App.vue'
import router from './router'
import { initColorScheme } from './app/colorScheme'
import { queryClient } from './app/queryClient'
import './app/styles.css'

async function enableMocking(): Promise<void> {
  if (import.meta.env.VITE_API_MOCK !== '1') return
  const { startMockApi } = await import('./mocks/browser')
  await startMockApi()
}

async function bootstrap(): Promise<void> {
  await enableMocking()
  initColorScheme()

  // Naive UI injects its styles at runtime; this meta tag keeps them ahead of app CSS
  // so our own stylesheets can override component styles where needed.
  const meta = document.createElement('meta')
  meta.name = 'naive-ui-style'
  document.head.prepend(meta)

  const app = createApp(App)
  app.use(createPinia())
  app.use(router)
  app.use(VueQueryPlugin, { queryClient })
  app.mount('#app')
}

void bootstrap()
