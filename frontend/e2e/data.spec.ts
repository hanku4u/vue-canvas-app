import { test, expect, type Page } from '@playwright/test'

// F6: data foundation. Needs the mock data API (started by playwright.config.ts).

const EMPTY = 'c-yield-review'

async function openCanvas(page: Page, id: string): Promise<void> {
  await page.goto(`/canvas/${id}`)
  await expect(page.getByTestId('canvas-view')).toBeVisible()
}

const state = (page: Page) => page.getByTestId('data-state')

async function addPreview(page: Page, dataset: string): Promise<void> {
  await page.getByTestId('palette-data-preview').click()
  await expect(state(page)).toHaveAttribute('data-state', 'unconfigured')
  await page.getByTestId('dataset-select').click()
  await page.locator('.n-base-select-option', { hasText: dataset }).first().click()
}

async function setStringList(page: Page, param: string, values: string[]): Promise<void> {
  const field = page.locator(`[data-param=${param}]`)
  await field.locator('.n-base-selection').click()
  for (const value of values) {
    await page.keyboard.type(value)
    await page.keyboard.press('Enter')
  }
  await page.keyboard.press('Escape')
}

test('a data preview loads a dataset and shows query details', async ({ page }) => {
  await openCanvas(page, EMPTY)
  await addPreview(page, 'SPC points')
  await expect(state(page)).toHaveAttribute('data-state', 'ready')
  await expect(page.getByTestId('preview-footer')).toContainText(/200 of [\d,]+ rows/)
  await expect(page.getByTestId('preview-table')).toContainText('CD_MEAN')
  await expect(page.getByTestId('frame-age')).toHaveText('now')

  await page.getByTestId('frame-menu').click()
  await page.locator('.n-dropdown-option', { hasText: 'View query details' }).click()
  const details = page.getByTestId('query-details')
  await expect(details).toContainText('"dataset": "spc_points"')
  await expect(details).toContainText('Rows from the data API')
  await details.getByRole('button', { name: 'Close', exact: true }).click()

  // Saved with the canvas: the preview reloads its data after a reload.
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved')
  await page.reload()
  await expect(state(page)).toHaveAttribute('data-state', 'ready')
})

test('changing a parameter requeries', async ({ page }) => {
  await openCanvas(page, EMPTY)
  await addPreview(page, 'SPC points')
  await expect(state(page)).toHaveAttribute('data-state', 'ready')
  const before = await page.getByTestId('preview-footer').textContent()

  await page.locator('[data-param=tool] .n-base-selection').click()
  await page.locator('.n-base-select-option', { hasText: 'ET-03' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('preview-footer')).not.toHaveText(before ?? '')
  await expect(page.getByTestId('preview-table')).toContainText('ET-03')
  await expect(page.getByTestId('preview-table')).not.toContainText('ET-01')
})

test('required parameters, empty results and loading', async ({ page }) => {
  await openCanvas(page, EMPTY)
  await page.evaluate(() => localStorage.setItem('mock.dataLatencyMs', '1500'))
  await addPreview(page, 'Lot route history')
  await expect(state(page)).toHaveAttribute('data-state', 'missing')
  await expect(state(page)).toContainText('Lots')

  await setStringList(page, 'lot', ['Z999999'])
  await expect(state(page)).toHaveAttribute('data-state', 'loading')
  await expect(page.getByTestId('data-empty')).toBeVisible({ timeout: 10_000 })
})

test('errors show the code and can be retried', async ({ page }) => {
  await openCanvas(page, EMPTY)
  await page.evaluate(() => localStorage.setItem('mock.dataFail', '500'))
  await addPreview(page, 'Tools')
  await expect(page.getByTestId('data-error')).toContainText('UPSTREAM_ERROR')
  await expect(page.getByTestId('data-error')).toContainText(/request mock-/)

  await page.evaluate(() => localStorage.removeItem('mock.dataFail'))
  await page.getByTestId('data-retry').click()
  await expect(state(page)).toHaveAttribute('data-state', 'ready')
  await expect(page.getByTestId('preview-table')).toContainText('ET-01')
})

test('refresh refetches from the data API', async ({ page }) => {
  await openCanvas(page, EMPTY)
  await addPreview(page, 'Tools')
  await expect(state(page)).toHaveAttribute('data-state', 'ready')
  const requests: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/mock-data/tools')) requests.push(r.url())
  })
  await page.getByTestId('frame-refresh').click()
  await expect.poll(() => requests.length).toBe(1)
  await expect(state(page)).toHaveAttribute('data-state', 'ready')
})

test('viewers see data but cannot change the data source', async ({ page }) => {
  // The owner adds a preview to the ET-03 canvas, where m.park is a viewer.
  await openCanvas(page, 'c-et03-excursion')
  await addPreview(page, 'Tools')
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved')

  await page.evaluate(() => localStorage.setItem('dev.knoxId', 'm.park'))
  await page.reload()
  await expect(state(page)).toHaveAttribute('data-state', 'ready')
  await page
    .locator('.vue-flow__node', { hasText: 'Data preview' })
    .locator('.frame__header')
    .click()
  await expect(page.getByTestId('dataset-select').locator('.n-base-selection')).toHaveClass(
    /n-base-selection--disabled/,
  )
  // Refreshing is allowed for viewers.
  await page.getByTestId('frame-refresh').click()
  await expect(state(page)).toHaveAttribute('data-state', 'ready')
})
