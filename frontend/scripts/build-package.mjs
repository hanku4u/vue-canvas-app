#!/usr/bin/env node
/**
 * Build the publishable npm package into ./package (docs/packaging.md):
 *   package/
 *     package.json, README.md, LICENSE (if present)
 *     dist/app/    prebuilt static app (index.html, config.json, assets/)
 *     dist/lib/    fab-canvas.js (+ chunks), style.css
 *     dist/types/  TypeScript declarations
 *     contract/    openapi.yaml, api.md
 * Usage: node scripts/build-package.mjs   (then `npm publish ./package`)
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'package')
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit' })

rmSync(out, { recursive: true, force: true })
run('npx', ['vite', 'build', '-c', 'vite.package.config.ts', '--mode', 'app'])
run('npx', ['vite', 'build', '-c', 'vite.package.config.ts', '--mode', 'lib'])
run('npx', ['tsc', '-p', 'tsconfig.package.json'])

// The MSW worker in public/ is for local development only.
rmSync(join(out, 'dist/app/mockServiceWorker.js'), { force: true })

// Default runtime config for the prebuilt app.
writeFileSync(
  join(out, 'dist/app/config.json'),
  JSON.stringify({ apiBase: '/api', appName: 'Fab Canvas' }, null, 2) + '\n',
)

// Entry declarations (mountApp + the API types).
writeFileSync(
  join(out, 'dist/types/index.d.ts'),
  `export type { FabCanvasConfig } from './app/config'
export type * from './api/types'
export type * from './api/adminTypes'
import type { FabCanvasConfig } from './app/config'

export interface MountedFabCanvas {
  /** The underlying Vue app (for advanced use). */
  app: unknown
  /** Remove the app from the page. */
  unmount(): void
}

/** Mount Fab Canvas into an element (or selector). */
export declare function mountApp(
  target: string | Element,
  config?: FabCanvasConfig,
): MountedFabCanvas
`,
)

// The backend contract.
mkdirSync(join(out, 'contract'), { recursive: true })
cpSync(join(root, 'contract/openapi.yaml'), join(out, 'contract/openapi.yaml'))
cpSync(join(root, '../docs/api.md'), join(out, 'contract/api.md'))
cpSync(join(root, 'package-readme.md'), join(out, 'README.md'))
for (const name of ['LICENSE', '../LICENSE']) {
  if (existsSync(join(root, name))) {
    cpSync(join(root, name), join(out, 'LICENSE'))
    break
  }
}

const app = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const meta = app.fabCanvasPackage ?? {}
const pkg = {
  name: meta.name ?? 'fab-canvas',
  version: app.version,
  description:
    'Infinite-canvas workspace for semiconductor engineers (charts, wafer maps, tables, notes, shared filters). Bring your own backend: see contract/openapi.yaml.',
  license: meta.license ?? 'UNLICENSED',
  repository: meta.repository,
  homepage: meta.homepage,
  keywords: ['vue', 'canvas', 'dashboard', 'semiconductor', 'wafer-map', 'spc'],
  type: 'module',
  types: './dist/types/index.d.ts',
  module: './dist/lib/fab-canvas.js',
  exports: {
    '.': { types: './dist/types/index.d.ts', import: './dist/lib/fab-canvas.js' },
    './style.css': './dist/lib/style.css',
    './app/*': './dist/app/*',
    './contract/*': './contract/*',
    './package.json': './package.json',
  },
  files: ['dist', 'contract', 'README.md', 'LICENSE'],
  sideEffects: ['*.css'],
  engines: { node: '>=18' },
}
writeFileSync(join(out, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')
console.log(`\nBuilt ${pkg.name}@${pkg.version} in ./package`)
