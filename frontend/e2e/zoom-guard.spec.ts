import { test, expect, type Page } from '@playwright/test'

// Ctrl/⌘ + wheel (and trackpad pinch, which browsers send as Ctrl+wheel) and Ctrl/⌘ +/−
// must never zoom the browser on the canvas page: over the canvas they zoom the canvas,
// elsewhere they do nothing.

const zoomLevel = (page: Page) => page.getByTestId('zoom-level')

/** Record whether the last wheel event's default (browser zoom) was prevented. */
async function watchWheel(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.addEventListener(
      'wheel',
      (e) => {
        ;(window as unknown as { __prevented: boolean }).__prevented = e.defaultPrevented
      },
      { capture: true },
    )
  })
}

const prevented = (page: Page) =>
  page.evaluate(() => (window as unknown as { __prevented?: boolean }).__prevented)

async function ctrlWheel(page: Page, x: number, y: number, deltaY: number): Promise<void> {
  await page.mouse.move(x, y)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, deltaY)
  await page.keyboard.up('Control')
}

test('pinch and Ctrl+wheel zoom the canvas, never the page', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.goto('/canvas/c-et03-excursion')
  await expect(page.locator('.vue-flow__node-component')).toHaveCount(4)
  await watchWheel(page)
  await expect(zoomLevel(page)).toHaveText('100%')

  const pane = (await page.locator('.vue-flow__pane').boundingBox())!

  // Over an active component (its body ignores the wheel so charts/tables can scroll).
  const notes = page.locator('.vue-flow__node-component').filter({ hasText: 'Investigation notes' })
  await notes.locator('.frame__header').click()
  await notes.click({ position: { x: 100, y: 120 } })
  const box = (await notes.boundingBox())!
  await ctrlWheel(page, box.x + 100, box.y + 120, 200)
  // One wheel notch is one 10% step, not a jump.
  await expect(zoomLevel(page)).toHaveText('91%')
  expect(await prevented(page)).toBe(true)
  const afterComponent = await zoomLevel(page).textContent()

  // On the bare canvas.
  await ctrlWheel(page, pane.x + 40, pane.y + pane.height - 60, -200)
  await expect(zoomLevel(page)).toHaveText('100%')
  expect(await prevented(page)).toBe(true)
  const afterPane = await zoomLevel(page).textContent()

  // Over the inspector: blocked, nothing zooms.
  const inspector = (await page.getByTestId('panel-right').boundingBox())!
  await ctrlWheel(page, inspector.x + 100, inspector.y + 300, -200)
  expect(await prevented(page)).toBe(true)
  await expect(zoomLevel(page)).toHaveText(afterPane!)

  // A plain wheel still pans rather than zooming.
  await page.mouse.move(pane.x + 40, pane.y + pane.height - 60)
  await page.mouse.wheel(0, 200)
  await expect(zoomLevel(page)).toHaveText(afterPane!)
})

test('Ctrl/⌘ + and − zoom the canvas; in full screen zoom gestures are blocked', async ({
  page,
}) => {
  await page.goto('/canvas/c-et03-excursion')
  await expect(page.locator('.vue-flow__node-component')).toHaveCount(4)
  await page.locator('.vue-flow__pane').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('ControlOrMeta+Equal')
  await expect(zoomLevel(page)).toHaveText('120%')
  await page.keyboard.press('ControlOrMeta+Minus')
  await expect(zoomLevel(page)).toHaveText('100%')

  const notes = page.locator('.vue-flow__node-component').filter({ hasText: 'Investigation notes' })
  await notes.locator('.frame__header').click()
  await page.keyboard.press('f')
  await expect(page.getByTestId('fullscreen')).toBeVisible()
  await watchWheel(page)
  await ctrlWheel(page, 400, 400, -200)
  expect(await prevented(page)).toBe(true)
  await page.keyboard.press('Escape')
  await expect(zoomLevel(page)).toHaveText('100%')
})
