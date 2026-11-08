import { test, expect, type Page } from '@playwright/test'

// Review feedback: resizable side panels, wafer maps that guide you to lots with data,
// and full screen for any component.

const nodes = (page: Page) => page.locator('.vue-flow__node-component')

test('the inspector can be resized by dragging and with the keyboard, and keeps its width', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.goto('/canvas/c-et03-excursion')
  const panel = page.getByTestId('panel-right')
  const before = (await panel.boundingBox())!.width
  const handle = page.getByTestId('panel-right-resize')
  const box = (await handle.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + 200)
  await page.mouse.down()
  await page.mouse.move(box.x - 150, box.y + 200, { steps: 5 })
  await page.mouse.up()
  const dragged = (await panel.boundingBox())!.width
  expect(dragged).toBeGreaterThan(before + 120)

  await handle.focus()
  await page.keyboard.press('ArrowRight')
  expect((await panel.boundingBox())!.width).toBeCloseTo(dragged - 16, 0)

  await page.reload()
  expect((await page.getByTestId('panel-right').boundingBox())!.width).toBeCloseTo(dragged - 16, 0)
  await page.getByTestId('panel-right-resize').dblclick()
  expect((await page.getByTestId('panel-right').boundingBox())!.width).toBeCloseTo(before, 0)
})

test('a wafer map without data suggests recently tested lots', async ({ page }) => {
  await page.goto('/canvas/c-yield-review')
  await page.getByTestId('palette-wafer-map').click()
  const help = page.getByTestId('wafer-help')
  await expect(help).toContainText('finished wafer sort')
  const pick = page.getByTestId('wafer-pick').first()
  const lot = await pick.getAttribute('data-lot')
  await pick.click()
  await expect(page.getByTestId('wafer-tile').first()).toBeVisible()
  await expect(page.getByTestId('wafer-tile').first()).toHaveAttribute(
    'data-wafer',
    new RegExp(`^${lot}\\.`),
  )

  // The inspector's lot suggestions are tested lots too.
  await page.locator('[data-param=lot] .n-base-selection').click()
  await expect(page.locator('.n-base-select-option').first()).toBeVisible()
})

test('full screen and back to the same place on the canvas', async ({ page }) => {
  await page.goto('/canvas/c-et03-excursion')
  await expect(nodes(page)).toHaveCount(4)
  const viewport = () => page.locator('.vue-flow__transformationpane').getAttribute('style')
  const before = await viewport()

  const notes = nodes(page).filter({ hasText: 'Investigation notes' })
  await notes.hover()
  await notes.getByTestId('frame-fullscreen').click()
  const full = page.getByTestId('fullscreen')
  await expect(full).toBeVisible()
  await expect(full).toContainText('Hypothesis')
  await expect(notes).toContainText('Shown full screen')
  // Canvas shortcuts are paused: Delete doesn't remove anything.
  await page.keyboard.press('Delete')
  await page.keyboard.press('Escape')
  await expect(full).toHaveCount(0)
  await expect(nodes(page)).toHaveCount(4)
  expect(await viewport()).toBe(before)
  await expect(notes).toContainText('Hypothesis')

  // F on a selected component, and the button to leave.
  await notes.locator('.frame__header').click()
  await page.keyboard.press('f')
  await expect(full).toBeVisible()
  await full.getByTestId('fullscreen-exit').click()
  await expect(full).toHaveCount(0)

  // From the component menu.
  await notes.getByTestId('frame-menu').click()
  await page.locator('.n-dropdown-option', { hasText: 'Full screen' }).click()
  await expect(full).toBeVisible()
  await expect(page.locator('.n-dropdown-menu')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(full).toHaveCount(0)
})

test('a table in full screen keeps working, then Esc returns', async ({ page }) => {
  await page.goto('/canvas/c-yield-review')
  await page.getByTestId('palette-table').click()
  await page.getByTestId('dataset-select').click()
  await page.locator('.n-base-select-option', { hasText: 'Lots' }).first().click()
  await expect(page.getByTestId('table-footer')).toContainText(/rows/)
  await page.keyboard.press('f')
  const full = page.getByTestId('fullscreen')
  await expect(full.getByTestId('table-footer')).toContainText(/rows/)
  await full.locator('.ag-header-cell[col-id=lot_id]').click()
  await expect(full.locator('.ag-header-cell[col-id=lot_id]')).toHaveAttribute(
    'aria-sort',
    'ascending',
  )
  await page.keyboard.press('Escape')
  await expect(full).toHaveCount(0)
  // The sort was saved on the component and shows on the canvas too.
  await expect(page.locator('.ag-header-cell[col-id=lot_id]')).toHaveAttribute(
    'aria-sort',
    'ascending',
  )
})
