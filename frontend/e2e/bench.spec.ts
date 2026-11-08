/* eslint-disable playwright/no-wait-for-timeout -- a benchmark measures settled states over fixed windows */
import { test, expect, type Page } from '@playwright/test'

// F13 benchmark (run with `npm run bench`): 36 data components in 6 groups plus 100
// notes. Measures load, query fan-out, pan/zoom frame rate and heap. Targets: ~60 fps
// panning, queries only for components drawn at full detail.

async function fps(page: Page, action: () => Promise<void>): Promise<number> {
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number; __counting: boolean }
    w.__frames = 0
    w.__counting = true
    const tick = () => {
      if (!w.__counting) return
      w.__frames += 1
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  const started = Date.now()
  await action()
  const seconds = (Date.now() - started) / 1000
  const frames = await page.evaluate(() => {
    const w = window as unknown as { __frames: number; __counting: boolean }
    w.__counting = false
    return w.__frames
  })
  return Math.round(frames / seconds)
}

async function pan(page: Page, steps = 120): Promise<void> {
  const box = (await page.locator('.vue-flow__pane').boundingBox())!
  const y = box.y + box.height - 30
  await page.mouse.move(box.x + 40, y)
  await page.mouse.down()
  for (let i = 0; i < steps; i += 1) {
    const t = i / steps
    await page.mouse.move(
      box.x + 40 + Math.sin(t * Math.PI * 2) * 300,
      y - Math.sin(t * Math.PI) * 120,
    )
  }
  await page.mouse.up()
}

test('benchmark canvas @bench', async ({ page }) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1600, height: 1000 })
  let queries = 0
  page.on('request', (r) => {
    if (r.url().endsWith('/api/query')) queries += 1
  })
  await page.goto('/')
  await page.getByTestId('create-benchmark').click()
  const started = Date.now()
  await expect(page.getByTestId('canvas-view')).toBeVisible()
  await expect(page.getByTestId('inspector')).toContainText('136 components')
  const loadMs = Date.now() - started

  // Fit everything: data components are previews (no queries) at this zoom.
  await page.keyboard.press('Shift+1')
  await page.waitForTimeout(1500)
  const queriesAtFit = queries
  const fpsFit = await fps(page, () => pan(page))

  // 100% on the first group: only what's on screen queries.
  await page.locator('[data-group-title="ET-01 investigation"] [data-testid=group-title]').click()
  await page.keyboard.press('Shift+2')
  await page.waitForTimeout(3000)
  const rendered = await page.locator('.vue-flow__node-component').count()
  const queriesAtGroup = queries - queriesAtFit
  const fpsGroup = await fps(page, () => pan(page))

  const fpsZoom = await fps(page, async () => {
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('-')
      await page.waitForTimeout(120)
    }
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('+')
      await page.waitForTimeout(120)
    }
  })
  const heapMb = await page.evaluate(() => {
    const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
    return memory ? Math.round(memory.usedJSHeapSize / 1024 / 1024) : null
  })

  const result = {
    loadMs,
    queriesAtFit,
    rendered,
    queriesAtGroup,
    fpsFit,
    fpsGroup,
    fpsZoom,
    heapMb,
  }
  console.log('BENCH', JSON.stringify(result))
  test.info().annotations.push({ type: 'bench', description: JSON.stringify(result) })

  expect(queriesAtFit).toBeLessThanOrEqual(6)
  expect(queriesAtGroup).toBeLessThanOrEqual(rendered * 2)
  expect(fpsFit).toBeGreaterThan(30)
  expect(fpsGroup).toBeGreaterThan(30)
})
