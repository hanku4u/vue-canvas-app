import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [vue(), vueDevTools()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      proxy: {
        // The FastAPI backend. Only reached when MSW is off (VITE_API_MOCK != 1).
        '/api': {
          target: env.API_PROXY_TARGET || 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
        // The local mock data API. Used by the MSW /api/query handler until FastAPI exists.
        '/mock-data': {
          target: env.MOCK_DATA_PROXY_TARGET || 'http://127.0.0.1:8001',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/mock-data/, ''),
        },
      },
    },
  }
})
