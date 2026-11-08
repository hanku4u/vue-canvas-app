import { test, expect } from '@playwright/test'

// F13: help, first-run tips, the per-component error boundary and keyboard-only paths.

test('? opens the keyboard shortcut cheat sheet', async ({ page }) => {
  await page.goto('/canvas/c-et03-excursion')
  await expect(page.getByTestId('canvas-view')).toBeVisible()
  await page.locator('.vue-flow__pane').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('Shift+Slash')
  const sheet = page.getByTestId('shortcuts-dialog')
  await expect(sheet).toBeVisible()
  await expect(sheet).toContainText('Group selection')
  await expect(sheet).toContainText('Zoom to fit')
  await expect(sheet.locator('kbd', { hasText: 'Shift' }).first()).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  // Also reachable from the zoom controls.
  await page.getByTestId('shortcuts-button').click()
  await expect(sheet).toBeVisible()
})

test('first-run tips on an empty canvas can be dismissed for good', async ({ page }) => {
  await page.goto('/canvas/c-yield-review')
  const tips = page.getByTestId('first-run-hints')
  await expect(tips).toContainText('Press ? for all keyboard shortcuts')
  await tips.getByRole('button', { name: "Don't show these tips again" }).click()
  await expect(tips).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId('canvas-empty')).toBeVisible()
  await expect(tips).toHaveCount(0)
})

test('a component that fails to render never breaks the canvas', async ({ page }) => {
  await page.addInitScript(() => {
    ;(window as unknown as { __crashComponents: string[] }).__crashComponents = [
      'c-et03-excursion-p1',
    ]
  })
  await page.goto('/canvas/c-et03-excursion')
  await expect(page.locator('.vue-flow__node-component')).toHaveCount(4)
  const crashed = page.getByTestId('frame-crashed')
  await expect(crashed).toHaveCount(1)
  await expect(crashed).toContainText('Simulated render failure')
  // The others render normally, and the canvas stays usable.
  await expect(
    page.locator('.vue-flow__node-component').filter({ hasText: 'Investigation notes' }),
  ).toContainText('Hypothesis')
  await page.evaluate(() => {
    ;(window as unknown as { __crashComponents: string[] }).__crashComponents = []
  })
  await crashed.getByRole('button', { name: 'Retry' }).click()
  await expect(crashed).toHaveCount(0)
})

test('keyboard only: add a component from the palette and set a filter', async ({ page }) => {
  await page.goto('/canvas/c-yield-review')
  await expect(page.getByTestId('canvas-view')).toBeVisible()
  await page.getByTestId('palette-note').focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.vue-flow__node-component')).toHaveCount(1)

  await page.getByTestId('filter-bar').getByTestId('add-filter').focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.n-dropdown-option', { hasText: 'Chamber' })).toBeVisible()
  // Options: Tool, Chamber, …
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('filter-editor')).toHaveAttribute('data-dimension', 'chamber')
  await page.keyboard.type('C')
  // Wait for the search to narrow the list (values load remotely).
  await expect(page.locator('.n-base-select-option')).toHaveText(['C'])
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/f\.chamber=C/)
})
