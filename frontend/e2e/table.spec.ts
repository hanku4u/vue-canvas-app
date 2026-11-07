import { test, expect, type Page } from '@playwright/test'

// F7: table component on the mock data API.

const EMPTY = 'c-yield-review'
const SEEDED = 'c-et03-excursion'

async function openCanvas(page: Page, id: string): Promise<void> {
  await page.goto(`/canvas/${id}`)
  await expect(page.getByTestId('canvas-view')).toBeVisible()
}

async function addTable(page: Page, dataset: string): Promise<void> {
  await page.getByTestId('palette-table').click()
  await page.getByTestId('dataset-select').click()
  await page.locator('.n-base-select-option', { hasText: dataset }).first().click()
  await expect(page.getByTestId('table-footer')).toContainText(/[\d,]+ rows/)
}

const cell = (page: Page, row: number, col: string) =>
  page.locator(`.ag-row[row-index="${row}"] [col-id="${col}"]`).first()

const footer = (page: Page) => page.getByTestId('table-footer')

async function saved(page: Page): Promise<void> {
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved')
}

test('loads lots, sorts on the server and keeps the sort', async ({ page }) => {
  await openCanvas(page, EMPTY)
  await addTable(page, 'Lots')
  await expect(cell(page, 0, 'lot_id')).not.toBeEmpty()
  const total = await footer(page).textContent()

  const header = page.locator('.ag-header-cell[col-id=lot_id]')
  await header.click() // ascending
  await expect(header).toHaveAttribute('aria-sort', 'ascending')
  const first = await cell(page, 0, 'lot_id').textContent()
  await header.click() // descending
  await expect(header).toHaveAttribute('aria-sort', 'descending')
  await expect(cell(page, 0, 'lot_id')).not.toHaveText(first ?? '')
  const last = await cell(page, 0, 'lot_id').textContent()
  expect((last ?? '').slice(1) > (first ?? '').slice(1) || last! > first!).toBe(true)
  await expect(footer(page)).toHaveText(total ?? '')

  await saved(page)
  await page.reload()
  await expect(page.locator('.ag-header-cell[col-id=lot_id]')).toHaveAttribute(
    'aria-sort',
    'descending',
  )
  await expect(cell(page, 0, 'lot_id')).toHaveText(last ?? '')
})

test('column filters page through the filtered rows', async ({ page }) => {
  await openCanvas(page, EMPTY)
  await addTable(page, 'Lots')
  const before = Number((await footer(page).textContent())?.replace(/\D/g, ''))

  await page.locator('.ag-header-cell[col-id=status] .ag-header-cell-filter-button').click()
  await page.locator('.ag-filter input[type=text]').first().fill('COMPLETE')
  await expect(footer(page)).toContainText('filtered')
  const count = async () =>
    Number((await footer(page).textContent())?.match(/([\d,]+) rows?/)?.[1]?.replace(/,/g, ''))
  await expect.poll(count).toBeLessThan(before)
  expect(await count()).toBeGreaterThan(0)
  await expect(cell(page, 0, 'status')).toHaveText('COMPLETE')
})

test('hide columns from the inspector', async ({ page }) => {
  await openCanvas(page, EMPTY)
  await addTable(page, 'Lots')
  await expect(page.locator('.ag-header-cell[col-id=product]')).toBeVisible()
  await page.locator('[data-testid=table-inspector] [data-column=product]').click()
  await expect(page.locator('.ag-header-cell[col-id=product]')).toHaveCount(0)
  await saved(page)
  await page.reload()
  await expect(page.locator('.ag-header-cell[col-id=lot_id]')).toBeVisible()
  await expect(page.locator('.ag-header-cell[col-id=product]')).toHaveCount(0)
})

test('row selection and copy as TSV', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await openCanvas(page, EMPTY)
  await addTable(page, 'Lots')
  const lot0 = await cell(page, 0, 'lot_id').textContent()
  await cell(page, 0, 'lot_id').click()
  await cell(page, 1, 'lot_id').click({ modifiers: ['ControlOrMeta'] })
  await expect(page.getByTestId('table-selected')).toHaveText('· 2 selected')

  await page.keyboard.press('ControlOrMeta+c')
  const text = await page.evaluate(() => navigator.clipboard.readText())
  const lines = text.split('\n')
  expect(lines[0]).toContain('Lot\tProduct')
  expect(lines).toHaveLength(3)
  expect(text).toContain(lot0 ?? '')
  // The component itself wasn't copied (canvas Ctrl+C is off inside the grid).
  await expect(page.locator('.vue-flow__node')).toHaveCount(1)
})

test('large results scroll in blocks', async ({ page }) => {
  await openCanvas(page, EMPTY)
  await addTable(page, 'SPC points')
  await page.locator('[data-param=level] .n-base-selection').click()
  await page.locator('.n-base-select-option', { hasText: 'site' }).click()
  await expect(footer(page)).toContainText(/\d{2},\d{3} rows/)
  await page
    .locator('.ag-body-vertical-scroll-viewport')
    .evaluate((el) => (el.scrollTop = 20_000 * 28))
  await expect(cell(page, 20_000, 'parameter')).toHaveText('CD_MEAN')
})

test('zoomed out, tables show a preview', async ({ page }) => {
  await openCanvas(page, EMPTY)
  await addTable(page, 'Lots')
  for (const level of ['83%', '69%', '58%', '48%']) {
    await page.locator('.vue-flow__pane').click({ position: { x: 5, y: 5 } })
    await page.keyboard.press('-')
    await expect(page.getByTestId('zoom-level')).toHaveText(level)
  }
  await expect(page.getByTestId('table-preview')).toContainText('Lots')
  await expect(page.locator('.ag-root')).toHaveCount(0)
})

test('viewers can sort for themselves without changing the saved table', async ({ page }) => {
  await openCanvas(page, SEEDED)
  await addTable(page, 'Lots')
  await saved(page)
  await page.evaluate(() => localStorage.setItem('dev.knoxId', 'm.park'))
  await page.reload()
  const header = page.locator('.ag-header-cell[col-id=lot_id]')
  await header.click()
  await expect(header).toHaveAttribute('aria-sort', 'ascending')
  await page.reload()
  await expect(page.locator('.ag-header-cell[col-id=lot_id]')).not.toHaveAttribute(
    'aria-sort',
    'ascending',
  )
})
