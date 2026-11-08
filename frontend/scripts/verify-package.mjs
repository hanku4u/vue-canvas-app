#!/usr/bin/env node
/**
 * Smoke-test the built package the way a consumer would use it (docs/packaging.md):
 * pack ./package, install the tarball into a scratch project, then in Chromium:
 *   1. the prebuilt app served under a sub-path, with config.json pointing at a custom
 *      apiBase and extra headers;
 *   2. mountApp() from a plain HTML page (no bundler);
 * against a tiny fake backend, and type-check the exported types.
 * Usage: npm run build:package && npm run verify:package
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, statSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const work = mkdtempSync(join(tmpdir(), 'fab-canvas-verify-'))
const sh = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'pipe' }).toString()

// Install the packed tarball like a consumer.
const tarball = sh('npm', ['pack', join(root, 'package'), '--pack-destination', work], work).trim().split('\n').pop()
writeFileSync(join(work, 'package.json'), JSON.stringify({ name: 'consumer', private: true }))
sh('npm', ['install', '--no-audit', '--no-fund', join(work, tarball)], work)
const pkg = join(work, 'node_modules/fab-canvas')
console.log(`installed ${tarball}`)

// 0. Types resolve for a TypeScript consumer.
writeFileSync(
  join(work, 'consumer.ts'),
  `import type { Canvas, CanvasOp, FabCanvasConfig, QueryRequest, MountedFabCanvas, Health } from 'fab-canvas'
import { mountApp } from 'fab-canvas'
const config: FabCanvasConfig = { apiBase: '/api', basePath: '/', headers: { a: 'b' } }
const op: CanvasOp = { op: 'component.delete', id: 'x', version: 1 }
const q: QueryRequest = { dataset: 'd', params: {}, shape: { kind: 'raw', limit: 10 } }
const handle: MountedFabCanvas = mountApp('#app', config)
export type T = [Canvas, Health, typeof op, typeof q, typeof handle]
`,
)
sh(
  'node',
  [join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--module', 'esnext',
    '--moduleResolution', 'bundler', '--lib', 'es2022,dom', '--skipLibCheck', 'false', 'consumer.ts'],
  work,
)
console.log('types: ok')

// Prebuilt app under /tools/fab/ with a custom API location and header.
const appDir = join(pkg, 'dist/app')
const index = readFileSync(join(appDir, 'index.html'), 'utf8').replace('<base href="/" />', '<base href="/tools/fab/" />')
const config = { apiBase: '/backend', appName: 'Consumer Fab', headers: { 'x-gateway': 'verify' } }

// Embedded page.
const embedHtml = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/pkg/dist/lib/style.css"><style>html,body,#root{height:100%;margin:0}</style></head>
<body><div id="root"></div><script type="module">
import { mountApp } from '/pkg/dist/lib/fab-canvas.js'
window.fab = mountApp('#root', { apiBase: '/backend', basePath: '/embed/', appName: 'Embedded Fab', headers: { 'x-gateway': 'verify' } })
</script></body></html>`

const seen = []
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }
const sendFile = (res, file) => {
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
}
const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json', 'x-request-id': 'verify' })
  res.end(JSON.stringify(body))
}
const canvas = {
  id: 'c1', title: 'Served by the fake backend', description: '', owner: { knoxId: 'u1', displayName: 'User One' },
  role: 'owner', componentCount: 0, version: 1, updatedAt: new Date().toISOString(),
}
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  const p = url.pathname
  if (p.startsWith('/backend/')) {
    seen.push({ path: p, gateway: req.headers['x-gateway'] })
    if (p === '/backend/me') return json(res, 200, { knoxId: 'u1', displayName: 'User One', isAdmin: false })
    if (p === '/backend/canvases') return json(res, 200, { items: url.searchParams.get('scope') === 'shared' ? [] : [canvas], nextCursor: null })
    return json(res, 404, { error: { code: 'NOT_FOUND', message: 'Not in the fake backend' } })
  }
  if (p.startsWith('/pkg/')) return sendFile(res, normalize(join(pkg, p.slice(5))))
  if (p.startsWith('/embed')) {
    res.writeHead(200, { 'content-type': 'text/html' })
    return res.end(embedHtml)
  }
  if (p.startsWith('/tools/fab/')) {
    const rel = p.slice('/tools/fab/'.length)
    if (rel === 'config.json') return json(res, 200, config)
    const file = join(appDir, rel)
    if (rel && existsSync(file) && statSync(file).isFile()) return sendFile(res, file)
    res.writeHead(200, { 'content-type': 'text/html' })
    return res.end(index) // SPA fallback
  }
  res.writeHead(404)
  res.end()
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const origin = `http://127.0.0.1:${server.address().port}`

const browser = await chromium.launch()
const failures = []
async function check(name, url, appName) {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(url)
  try {
    await page.getByText('Served by the fake backend').first().waitFor({ timeout: 15000 })
    await page.getByText(appName).first().waitFor({ timeout: 5000 })
  } catch (e) {
    failures.push(`${name}: ${e.message.split('\n')[0]}`)
  }
  if (errors.length) failures.push(`${name}: page errors: ${errors.join('; ')}`)
  const calls = seen.splice(0)
  if (!calls.some((c) => c.path === '/backend/me')) failures.push(`${name}: never called /backend/me`)
  if (calls.some((c) => c.gateway !== 'verify')) failures.push(`${name}: a request lacked the configured header`)
  // A client-side route keeps the base path.
  await page.getByText('Served by the fake backend').first().click().catch(() => {})
  await page.waitForURL(/canvas\/c1/, { timeout: 5000 }).catch(() => failures.push(`${name}: routing outside basePath`))
  if (!new URL(page.url()).pathname.startsWith(new URL(url).pathname)) failures.push(`${name}: left its base path (${page.url()})`)
  await page.close()
  console.log(`${name}: ${failures.length ? 'see failures' : 'ok'}`)
}
await check('prebuilt app at /tools/fab/', `${origin}/tools/fab/`, 'Consumer Fab')
await check('mountApp() embed at /embed/', `${origin}/embed/`, 'Embedded Fab')
await browser.close()
server.close()
rmSync(work, { recursive: true, force: true })

if (failures.length) {
  console.error('\nPackage verification failed:\n- ' + failures.join('\n- '))
  process.exit(1)
}
console.log('\nPackage verified.')
