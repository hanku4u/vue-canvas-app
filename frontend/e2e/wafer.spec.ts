import { test, expect, type Page } from '@playwright/test'
import { excursionLot } from './fixtures'

// F9: wafer maps of a lot from the planted excursion (ET-03 chamber C).

const EMPTY = 'c-yield-review'

async function addWaferMap(page: Page, lot: string): Promise<void> {
  await page.goto(`/canvas/${EMPTY}`)
  await expect(page.getByTestId('canvas-view')).toBeVisible()
  await page.getByTestId('palette-wafer-map').click()
  await expect(page.getByTestId('data-state')).toContainText('Lots or Wafers')
  await page.locator('[data-param=lot] .n-base-selection').click()
  await page.keyboard.type(lot)
  await page.keyboard.press('Enter')
  await page.keyboard.press('Escape')
}

const tiles = (page: Page) => page.getByTestId('wafer-tile')

test('gallery shows all 25 wafers on one color scale; stacked averages them', async ({
  page,
  request,
}) => {
  const { lot } = await excursionLot(request)
  await addWaferMap(page, lot)
  await expect(tiles(page)).toHaveCount(25)
  await expect(page.getByTestId('wafer-count')).toHaveText('25 wafers')
  await expect(page.getByTestId('wafer-legend')).toContainText('Value (mV)')

  await page.locator('[data-field=mode]').getByText('Stacked').click()
  await expect(tiles(page)).toHaveCount(1)
  await expect(page.getByTestId('wafer-map')).toContainText('mean of 25 wafers per die')

  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved')
  await page.reload()
  await expect(tiles(page)).toHaveCount(1)
})

test('one wafer at a time with a picker; hover shows the die', async ({ page, request }) => {
  const { lot } = await excursionLot(request)
  await addWaferMap(page, lot)
  await page.locator('[data-field=mode]').getByText('One wafer').click()
  await expect(tiles(page)).toHaveCount(1)
  await expect(tiles(page)).toHaveAttribute('data-wafer', `${lot}.01`)

  await page.getByRole('button', { name: 'Next wafer' }).click()
  await expect(tiles(page)).toHaveAttribute('data-wafer', `${lot}.02`)

  const box = await tiles(page).locator('canvas').boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await expect(page.getByTestId('wafer-tooltip')).toContainText(`${lot}.02`)
  await expect(page.getByTestId('wafer-tooltip')).toContainText(/Die \d+, \d+/)
})

test('clicking wafers selects them', async ({ page, request }) => {
  const { lot } = await excursionLot(request)
  await addWaferMap(page, lot)
  await expect(tiles(page)).toHaveCount(25)
  await page.locator(`[data-wafer="${lot}.03"]`).click()
  await page.locator(`[data-wafer="${lot}.05"]`).click({ modifiers: ['Shift'] })
  await expect(page.locator('[data-testid=wafer-tile].is-selected')).toHaveCount(2)
  await page.locator(`[data-wafer="${lot}.05"]`).click()
  await expect(page.locator('[data-testid=wafer-tile].is-selected')).toHaveCount(1)
})

test('zoomed out, wafer maps show a snapshot', async ({ page, request }) => {
  const { lot } = await excursionLot(request)
  await addWaferMap(page, lot)
  await expect(tiles(page)).toHaveCount(25)
  for (const level of ['83%', '69%', '58%', '48%']) {
    await page.locator('.vue-flow__pane').click({ position: { x: 5, y: 5 } })
    await page.keyboard.press('-')
    await expect(page.getByTestId('zoom-level')).toHaveText(level)
  }
  await expect(page.getByTestId('wafer-preview').locator('img')).toHaveAttribute(
    'src',
    /^data:image\/png/,
  )
})
