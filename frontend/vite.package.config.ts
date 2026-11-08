/**
 * Builds the npm package (docs/packaging.md). Two outputs, selected with --mode:
 *
 * - `app`: the prebuilt static app (package/dist/app). Asset URLs are relative and
 *   index.html carries a `<base href="/">` to edit if the app is served under a sub-path.
 *   Runtime settings come from config.json next to index.html.
 * - `lib`: `mountApp()` as one ES module with lazy chunks (package/dist/lib). Everything is
 *   bundled (Vue included), so consumers need no other dependencies or a bundler.
 *
 * Neither output contains the mock backend (MSW only loads when VITE_API_MOCK=1).
 */
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'

const BASE_HREF: Plugin = {
  name: 'fab-canvas-base-href',
  transformIndexHtml(html) {
    return html
      .replace('<head>', '<head>\n    <base href="/" />')
      .replace('href="/favicon.ico"', 'href="favicon.ico"')
  },
}

export default defineConfig(({ mode }) => {
  const lib = mode === 'lib'
  return {
    plugins: [vue(), ...(lib ? [] : [BASE_HREF])],
    base: './',
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    define: {
      // Library mode doesn't replace these by itself; bundled Vue and friends need them.
      'process.env.NODE_ENV': JSON.stringify('production'),
      __VUE_PROD_DEVTOOLS__: 'false',
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
    },
    publicDir: lib ? false : 'public',
    build: {
      outDir: lib ? 'package/dist/lib' : 'package/dist/app',
      emptyOutDir: true,
      // Library mode leaves ES output unminified by default.
      minify: true,
      chunkSizeWarningLimit: 1000,
      ...(lib
        ? {
            lib: {
              entry: fileURLToPath(new URL('./src/lib.ts', import.meta.url)),
              formats: ['es' as const],
              fileName: () => 'fab-canvas.js',
              cssFileName: 'style',
            },
          }
        : {}),
    },
  }
})
