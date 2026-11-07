import { test, expect, type Page } from '@playwright/test'
import { excursionLot } from './fixtures'

// F10: filters and cross-filtering. The ★ demo: the ET-03 investigation from scratch.

const EMPTY = 'c-yield-review'

async function openCanvas(page: Page, url: string): Promise<void> {
  await page.goto(url)
  await expect(page.getByTestId('canvas-view')).toBeVisible()
}

const bar = (page: Page) => page.getByTestId('filter-bar')
const chip = (page: Page, dimension: string) =>
  bar(page).locator(`[data-testid=filter-chip][data-dimension=${dimension}]`)

/** Add a canvas filter from the filter bar. */
async function addListFilter(page: Page, label: string, value: string): Promise<void> {
  await bar(page).getByTestId('add-filter').click()
  await page.locator('.n-dropdown-option', { hasText: label }).click()
  await page.getByTestId('filter-values').click()
  await page.keyboard.type(value)
  await page.locator('.n-base-select-option', { hasText: value }).first().click()
  await page.keyboard.press('Escape')
  await page.locator('.vue-flow__pane').click({ position: { x: 5, y: 5 } })
}

async function setTimeRange(page: Page, label: string): Promise<void> {
  await chip(page, 'time_range').locator('button').first().click()
  await page.locator('.n-radio-button', { hasText: label }).click()
  await page.locator('.vue-flow__pane').click({ position: { x: 5, y: 5 } })
}

/** Place the selected component through the inspector's geometry fields. */
async function place(page: Page, x: number, y: number, w: number, h: number): Promise<void> {
  const inspector = page.getByTestId('inspector')
  for (const [name, value] of [
    ['X', x],
    ['Y', y],
    ['W', w],
    ['H', h],
  ] as const) {
    const input = inspector.locator('label', { hasText: new RegExp(`^${name}$`) }).locator('input')
    await input.fill(String(value))
    await input.press('Enter')
  }
}

async function chooseDataset(page: Page, label: string): Promise<void> {
  await page.getByTestId('dataset-select').click()
  await page.locator('.n-base-select-option', { hasText: label }).first().click()
}

const node = (page: Page, type: string) => page.locator(`.vue-flow__node:has([data-type=${type}])`)

test('★ ET-03 investigation: canvas filters, SPC, lot table → wafer gallery, shareable URL', async ({
  page,
  context,
  request,
}) => {
  test.setTimeout(90_000)
  const { lot } = await excursionLot(request)
  await page.setViewportSize({ width: 1600, height: 1000 })
  await openCanvas(page, `/canvas/${EMPTY}`)

  // 1. Canvas time range = last 30 days, tool = ET-03.
  await expect(chip(page, 'time_range')).toContainText('Last 7 days')
  await setTimeRange(page, 'Last 30 days')
  await addListFilter(page, 'Tool', 'ET-03')
  await expect(chip(page, 'time_range')).toContainText('Last 30 days')
  await expect(chip(page, 'tool_id')).toContainText('ET-03')
  await expect(page).toHaveURL(/f\.time_range=last_30d/)
  await expect(page).toHaveURL(/f\.tool_id=ET-03/)

  // 2. SPC chart of CD_MEAN shows the chamber-C excursion (tool and time from the filters).
  await page.getByTestId('palette-chart').click()
  await place(page, 0, 0, 640, 400)
  await page.locator('[data-field=kind] .n-base-selection').click()
  await page.locator('.n-base-select-option', { hasText: 'SPC control chart' }).click()
  await chooseDataset(page, 'SPC points')
  await expect(page.locator('[data-binding=tool]')).toContainText('ET-03')
  const badge = page.getByTestId('ooc-badge')
  await expect(badge).toHaveText(/\d+ OOC/)
  await expect
    .poll(async () => Number((await badge.textContent())?.replace(/\D/g, '')))
    .toBeGreaterThan(20)
  const ooc = await badge.textContent()
  await expect(node(page, 'chart').getByTestId('frame-filters')).toContainText('Tool: ET-03')

  // 3. A lot table bound to tool_id, with lot selection publishing the Lot filter.
  await page.getByTestId('palette-table').click()
  await place(page, 0, 480, 640, 360)
  await chooseDataset(page, 'Lots')
  await expect(page.locator('[data-binding=tool]')).toContainText('ET-03')
  await page.getByTestId('add-publish').click()
  await expect(page.getByTestId('publish-rule')).toHaveCount(1)
  await expect(page.getByTestId('table-footer')).toContainText(/[\d,]+ rows/)

  // 4. A wafer map next to it; group both.
  await page.getByTestId('palette-wafer-map').click()
  await place(page, 704, 480, 640, 520)
  await expect(node(page, 'wafer-map').getByTestId('data-state')).toContainText('Lots or Wafers')
  await node(page, 'table').locator('.frame__header').click()
  await node(page, 'wafer-map')
    .locator('.frame__header')
    .click({ modifiers: ['Shift'] })
  await page.keyboard.press('ControlOrMeta+g')
  await expect(page.locator('[data-group-title]')).toHaveCount(1)

  // Selecting the excursion lot in the table shows its wafers in the group.
  await page.locator('.ag-header-cell[col-id=lot_id] .ag-header-cell-filter-button').click()
  await page.locator('.ag-filter input[type=text]').first().fill(lot)
  await expect(page.getByTestId('table-footer')).toContainText('1 row')
  await page.keyboard.press('Escape')
  await page.locator('.ag-row[row-index="0"] .ag-selection-checkbox input').first().check()
  const groupChip = page.locator(
    '[data-testid^=group-] [data-testid=filter-chip][data-dimension=lot_id]',
  )
  await expect(groupChip).toContainText(lot)
  await expect(groupChip).toContainText('Table')
  await expect(page.getByTestId('wafer-tile')).toHaveCount(25)
  await expect(node(page, 'wafer-map').getByTestId('frame-filters')).toContainText(`Lot: ${lot}`)
  // The table doesn't filter itself on the lot it published; the chart is outside the group.
  await expect(node(page, 'table').getByTestId('frame-filters')).not.toContainText('Lot')
  await expect(badge).toHaveText(ooc!)

  // Hovering the chip highlights its source.
  await groupChip.locator('button').first().hover()
  await expect(node(page, 'table').locator('.frame')).toHaveClass(/is-highlighted/)

  // 5. The URL reproduces the view (canvas filters) in a new tab.
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved')
  const other = await context.newPage()
  await other.setViewportSize({ width: 1600, height: 1000 })
  await openCanvas(other, page.url())
  await expect(chip(other, 'time_range')).toContainText('Last 30 days')
  await expect(chip(other, 'tool_id')).toContainText('ET-03')
  await expect(other.getByTestId('ooc-badge')).toHaveText(ooc!)
})

test('save as default, reset, and per-component unlinking', async ({ page }) => {
  await openCanvas(page, `/canvas/${EMPTY}`)
  await addListFilter(page, 'Tool', 'ET-01')
  await page.getByTestId('palette-table').click()
  await chooseDataset(page, 'Lots')
  await expect(page.getByTestId('frame-filters')).toContainText('Tool: ET-01')

  // Unlink: the table ignores the tool filter.
  await page.locator('[data-binding=tool]').getByTestId('unlink-param').click()
  await expect(page.locator('[data-binding=tool]')).toContainText('Ignores the Tool filter')
  await expect(page.getByTestId('frame-filters')).not.toContainText('Tool')
  await page.locator('[data-binding=tool]').getByTestId('link-param').click()
  await expect(page.getByTestId('frame-filters')).toContainText('Tool: ET-01')

  // Save as default: survives a reload without the URL parameter.
  await page.getByTestId('save-filters').click()
  await expect(chip(page, 'tool_id')).toHaveClass(/chip--default/)
  await expect(page).not.toHaveURL(/f\.tool_id/)
  // Saving a default is an ordinary edit: undo and redo it.
  await page.locator('.vue-flow__pane').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('ControlOrMeta+z')
  await expect(chip(page, 'tool_id')).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect(chip(page, 'tool_id')).toHaveClass(/chip--default/)
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved')
  await page.goto(`/canvas/${EMPTY}`)
  await expect(chip(page, 'tool_id')).toContainText('ET-01')
  await expect(page.getByTestId('frame-filters')).toContainText('Tool: ET-01')

  // A session value overrides the default; Reset goes back to it.
  await chip(page, 'tool_id').locator('button').first().click()
  await page.getByTestId('filter-values').click()
  await page.keyboard.type('ET-02')
  await page.locator('.n-base-select-option', { hasText: 'ET-02' }).first().click()
  await page.keyboard.press('Escape')
  await page.locator('.vue-flow__pane').click({ position: { x: 5, y: 5 } })
  await expect(page.getByTestId('frame-filters')).toContainText('Tool: ET-01, ET-02')
  await page.getByTestId('reset-filters').click()
  await expect(page.getByTestId('frame-filters')).toContainText('Tool: ET-01')
})

test('viewers can filter but not save defaults', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('dev.knoxId', 'm.park'))
  await openCanvas(page, '/canvas/c-et03-excursion?f.chamber=C')
  await expect(chip(page, 'chamber')).toContainText('C')
  await expect(page.getByTestId('save-filters')).toHaveCount(0)
  await page.getByTestId('reset-filters').click()
  await expect(chip(page, 'chamber')).toHaveCount(0)
  await expect(page).not.toHaveURL(/f\.chamber/)
})
