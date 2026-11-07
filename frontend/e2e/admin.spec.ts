import { test, expect, type Page } from '@playwright/test'

// F12: admin screens on the mock backend (docs/admin.md). j.doe is a bootstrap admin.

const tile = (page: Page, label: string) =>
  page.getByTestId('stat-tile').filter({ hasText: label }).locator('strong')

async function selectOption(page: Page, testId: string, option: string): Promise<void> {
  await page.getByTestId(testId).click()
  await page.locator('.n-base-select-option', { hasText: option }).first().click()
}

test('usage overview: tiles, charts and the time range', async ({ page }) => {
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/admin\/usage$/)
  await expect(page.getByTestId('stat-tile')).toHaveCount(6)
  await expect(page.getByTestId('admin-chart')).toHaveCount(4)
  await expect(page.getByTestId('top-canvases').locator('li')).not.toHaveCount(0)
  const week = await tile(page, 'Queries').textContent()

  await page.getByTestId('range-select').getByText('30 days').click()
  await expect(page).toHaveURL(/range=30d/)
  await expect(tile(page, 'Queries')).not.toHaveText(week!)
  // The range follows navigation.
  await page.getByTestId('admin-nav').getByText('Datasets').click()
  await expect(page).toHaveURL(/usage\/datasets\?range=30d/)
})

test('datasets: table, sorting and detail', async ({ page }) => {
  await page.goto('/admin/usage/datasets')
  const rows = page.getByTestId('datasets-table').locator('tbody tr')
  await expect(rows).toHaveCount(8)
  // Busiest first; spc_points is the busiest.
  await expect(rows.first()).toHaveAttribute('data-dataset', 'spc_points')
  await page.getByTestId('datasets-table').getByText('p95').click()
  await page.getByRole('link', { name: 'Wafer sort (die level)' }).click()
  await expect(page.getByTestId('dataset-title')).toHaveText('Wafer sort (die level)')
  await expect(page.getByTestId('admin-chart').first()).toBeVisible()
  await expect(page.getByTestId('dataset-slowest').locator('tbody tr')).not.toHaveCount(0)
})

test('slow queries and errors, including an empty result', async ({ page }) => {
  await page.goto('/admin/usage/slow')
  await expect(page.getByTestId('slow-table').locator('tbody tr').first()).toBeVisible()
  await selectOption(page, 'slow-threshold', '> 30 s')
  await expect(page.getByTestId('admin-empty')).toContainText('No calls above this threshold')

  await page.locator('.n-tabs-tab', { hasText: 'Errors' }).click()
  await selectOption(page, 'error-code', 'UPSTREAM_TIMEOUT')
  await expect(page).toHaveURL(/code=UPSTREAM_TIMEOUT/)
  const codes = page.getByTestId('errors-table').locator('tbody tr td:nth-child(2)')
  await expect(codes.first()).toHaveText('UPSTREAM_TIMEOUT')
})

test('health cards and the data API check', async ({ page }) => {
  await page.goto('/admin/health')
  for (const card of ['data-api', 'database', 'cache', 'concurrency', 'app']) {
    await expect(page.getByTestId(`health-${card}`).getByTestId('health-status')).toHaveAttribute(
      'data-status',
      'ok',
    )
  }
  await expect(page.getByTestId('health-data-api')).toContainText('Last failure')
  await expect(page.getByTestId('admin-chart')).toBeVisible()
})

test('error state, and retry once the backend recovers', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.setItem('mock.adminFail', 'usage'))
  await page.goto('/admin/usage')
  await expect(page.getByTestId('admin-error')).toContainText('simulated')
  await page.evaluate(() => localStorage.removeItem('mock.adminFail'))
  await page.getByTestId('admin-error').getByRole('button', { name: 'Retry' }).click()
  await expect(page.getByTestId('stat-tile')).toHaveCount(6)
})

test('admins: grant and revoke, both audited', async ({ page }) => {
  await page.goto('/admin/admins')
  const table = page.getByTestId('admins-table')
  await expect(table).toContainText('from config') // j.doe
  await expect(table).toContainText('a.kim')
  await page.getByTestId('user-picker').click()
  await page.keyboard.type('k.lee')
  await page.locator('.n-base-select-option', { hasText: 'k.lee' }).click()
  await expect(table).toContainText('k.lee')
  await page.getByTestId('remove-admin-k.lee').click()
  await page.getByRole('button', { name: 'Remove' }).last().click()
  await expect(table).not.toContainText('k.lee')

  await page.getByTestId('admin-nav').getByText('Audit log').click()
  const audit = page.getByTestId('audit-table')
  await expect(audit).toContainText('admin.revoke')
  await expect(audit).toContainText('admin.grant')
  await selectOption(page, 'audit-action', 'admin.revoke')
  await expect(audit.locator('tbody tr')).toHaveCount(1)
  await selectOption(page, 'audit-actor', 'm.park')
  await expect(page.getByTestId('admin-empty')).toBeVisible()
})

test('canvases: delete, restore and transfer ownership', async ({ page }) => {
  await page.goto('/admin/canvases')
  const row = (id: string) => page.locator(`[data-canvas="${id}"]`)
  await expect(page.getByTestId('canvases-table').locator('tbody tr')).toHaveCount(4)

  await page.getByTestId('canvas-actions-c-cmp-monitor').click()
  await page.locator('.n-dropdown-option:visible', { hasText: 'Delete' }).click()
  await page.getByRole('button', { name: 'Delete' }).last().click()
  await expect(row('c-cmp-monitor')).toHaveCount(0)
  await page.getByTestId('show-deleted').click()
  await expect(row('c-cmp-monitor')).toContainText('deleted')
  await page.getByTestId('canvas-actions-c-cmp-monitor').click()
  await page.locator('.n-dropdown-option:visible', { hasText: 'Restore' }).click()
  await expect(row('c-cmp-monitor')).not.toContainText('deleted')
  await page.keyboard.press('Escape')
  await expect(page.locator('.n-dropdown-option:visible')).toHaveCount(0)

  await page.getByTestId('canvas-actions-c-yield-review').click()
  await page.locator('.n-dropdown-option:visible', { hasText: 'Transfer ownership' }).click()
  const dialog = page.getByTestId('transfer-dialog')
  await dialog.getByTestId('user-picker').click()
  await page.keyboard.type('k.lee')
  await page.locator('.n-base-select-option', { hasText: 'k.lee' }).click()
  await dialog.getByTestId('transfer-confirm').click()
  await expect(row('c-yield-review')).toContainText('Kim Lee')
  await expect(row('c-yield-review').locator('td').nth(2)).toHaveText('1') // j.doe kept as editor

  // Filter by owner.
  await selectOption(page, 'owner-filter', 'k.lee')
  await expect(page.getByTestId('canvases-table').locator('tbody tr')).toHaveCount(2)
})

test('user access lookup and removing all shares', async ({ page }) => {
  await page.goto('/admin/users')
  await expect(page.getByTestId('access-prompt')).toBeVisible()
  await page.getByTestId('user-picker').click()
  await page.keyboard.type('k.lee')
  await page.locator('.n-base-select-option', { hasText: 'k.lee' }).click()
  await expect(page).toHaveURL(/user=k\.lee/)
  await expect(page.getByTestId('access-shared').locator('.n-list-item')).toHaveCount(2)
  await expect(page.getByTestId('access-hidden')).toContainText('Supplier notes')

  await page.getByTestId('revoke-shares').click()
  await page.getByRole('button', { name: 'Remove shares' }).click()
  await expect(page.getByTestId('access-shared')).toHaveCount(0)
  await expect(page.getByTestId('revoke-shares')).toBeDisabled()
})

test('admins opening a canvas that is not theirs see a banner', async ({ page }) => {
  await page.goto('/canvas/c-litho-weekly')
  await expect(page.getByTestId('admin-banner')).toContainText('Viewing as admin')
  await page.goto('/canvas/c-yield-review')
  await expect(page.getByTestId('canvas-view')).toBeVisible()
  await expect(page.getByTestId('admin-banner')).toHaveCount(0)
})
