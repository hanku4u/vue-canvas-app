import { test, expect, type Page } from '@playwright/test'

// F8: charts on the mock data API.

const EMPTY = 'c-yield-review'

async function openCanvas(page: Page, id: string): Promise<void> {
  await page.goto(`/canvas/${id}`)
  await expect(page.getByTestId('canvas-view')).toBeVisible()
}

async function select(page: Page, field: string, option: string): Promise<void> {
  await page.locator(`${field} .n-base-selection`).click()
  await page.locator('.n-base-select-option', { hasText: option }).first().click()
}

async function addChart(page: Page, kind: string): Promise<void> {
  await page.getByTestId('palette-chart').click()
  await select(page, '[data-field=kind]', kind)
  await page.getByTestId('dataset-select').click()
  await page.locator('.n-base-select-option', { hasText: 'SPC points' }).first().click()
}

/** Last 30 days of ET-03. The tool is set last, so seeing it in the request means both landed. */
async function et03LastMonth(page: Page): Promise<void> {
  await select(page, '[data-param=start]', '30 days ago')
  await select(page, '[data-param=tool]', 'ET-03')
  await page.keyboard.press('Escape')
}

const chart = (page: Page) => page.getByTestId('chart')

test('SPC chart for ET-03 shows the chamber-C excursion as out-of-control points', async ({
  page,
}) => {
  await openCanvas(page, EMPTY)
  await addChart(page, 'SPC control chart')
  await et03LastMonth(page)

  const badge = page.getByTestId('ooc-badge')
  // Wait until the last parameter change has gone through: the request covers ET-03 only.
  await page.getByTestId('frame-menu').click()
  await page.locator('.n-dropdown-option', { hasText: 'View query details' }).click()
  await expect(page.getByTestId('query-details')).toContainText('"ET-03"')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('data-state')).toHaveAttribute('data-state', 'ready')
  await expect(badge).toHaveText(/[1-9]\d* OOC/)
  const ooc = Number((await badge.textContent())?.replace(/\D/g, ''))
  expect(ooc).toBeGreaterThan(20)
  await expect(page.getByTestId('downsampled')).toContainText('points')
  await expect(chart(page).locator('canvas')).toHaveCount(1)

  // Saved: the chart comes back after a reload.
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved')
  await page.reload()
  await expect(page.getByTestId('ooc-badge')).toHaveText(`${ooc} OOC`)
})

test('trend, scatter, histogram and box plot render', async ({ page }) => {
  await openCanvas(page, EMPTY)
  await addChart(page, 'Trend (line)')
  await expect(chart(page).locator('canvas')).toHaveCount(1)
  for (const [label, kind] of [
    ['Scatter', 'scatter'],
    ['Histogram', 'histogram'],
    ['Box plot', 'boxplot'],
  ] as const) {
    await select(page, '[data-field=kind]', label)
    await expect(chart(page)).toHaveAttribute('data-kind', kind)
    await expect(page.getByTestId('data-state')).toHaveAttribute('data-state', 'ready')
    await expect(chart(page).locator('canvas')).toHaveCount(1)
  }
})

test('box-zoom on time refetches the range; reset returns to the full range', async ({ page }) => {
  await openCanvas(page, EMPTY)
  await addChart(page, 'SPC control chart')
  await expect(page.getByTestId('ooc-badge')).toBeVisible()

  const box = await chart(page).locator('canvas').boundingBox()
  expect(box).not.toBeNull()
  const canvas = box!
  // The chart is active (just added), so dragging inside it box-zooms.
  await page.mouse.move(canvas.x + canvas.width * 0.3, canvas.y + canvas.height * 0.5)
  await page.mouse.down()
  await page.mouse.move(canvas.x + canvas.width * 0.5, canvas.y + canvas.height * 0.5, { steps: 8 })
  await page.mouse.up()
  await expect(page.getByTestId('reset-zoom')).toBeVisible()

  await page.getByTestId('frame-menu').click()
  await page.locator('.n-dropdown-option', { hasText: 'View query details' }).click()
  await expect(page.getByTestId('query-details')).toContainText('"xRange"')
  await page.keyboard.press('Escape')

  await page.getByTestId('reset-zoom').click()
  await expect(page.getByTestId('reset-zoom')).toHaveCount(0)
})

test('zoomed out, charts show their last snapshot', async ({ page }) => {
  await openCanvas(page, EMPTY)
  await addChart(page, 'Trend (line)')
  await expect(chart(page).locator('canvas')).toHaveCount(1)
  for (const level of ['83%', '69%', '58%', '48%']) {
    await page.locator('.vue-flow__pane').click({ position: { x: 5, y: 5 } })
    await page.keyboard.press('-')
    await expect(page.getByTestId('zoom-level')).toHaveText(level)
  }
  await expect(page.getByTestId('chart-preview').locator('img')).toHaveAttribute(
    'src',
    /^data:image\/png/,
  )
})
