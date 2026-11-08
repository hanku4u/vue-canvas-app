import { test, expect, type Page } from '@playwright/test'
import { ContractValidator } from '../contract/validator'
import { excursionLot } from './fixtures'

// Every request the UI sends and every JSON response it receives during a tour of the app
// must match contract/openapi.yaml. A backend that implements the spec therefore serves
// the same shapes the UI is tested against.

const validator = new ContractValidator()

function record(page: Page, problems: string[], seen: Set<string>): Promise<void>[] {
  const pending: Promise<void>[] = []
  page.on('response', (response) => pending.push(inspect(response)))
  async function inspect(response: import('@playwright/test').Response): Promise<void> {
    const url = new URL(response.url())
    if (!url.pathname.startsWith('/api/')) return
    const request = response.request()
    const path = url.pathname.replace(/^\/api/, '')
    const isJson = (response.headers()['content-type'] ?? '').includes('application/json')
    let responseBody: unknown
    try {
      responseBody = isJson ? await response.json() : undefined
    } catch {
      return // navigated away before the body arrived
    }
    const raw = request.postData()
    const requestBody = raw ? JSON.parse(raw) : undefined
    const template = validator.match(path)
    seen.add(`${request.method()} ${template ?? path}`)
    problems.push(
      ...validator.check({
        method: request.method(),
        path,
        status: response.status(),
        requestBody,
        responseBody,
        responseIsJson: isJson,
      }),
    )
  }
  return pending
}

test('UI traffic conforms to the OpenAPI contract', async ({ page, request }) => {
  test.setTimeout(120_000)
  const problems: string[] = []
  const seen = new Set<string>()
  const pending = record(page, problems, seen)
  const { lot } = await excursionLot(request)
  await page.setViewportSize({ width: 1500, height: 950 })

  // Home, create, rename via ops.
  await page.goto('/')
  await expect(page.locator('[data-testid^=canvas-card-]').first()).toBeVisible()

  // A canvas with every component type, filters, publishing and saving.
  await page.goto('/canvas/c-yield-review?f.time_range=last_30d&f.tool_id=ET-03')
  await expect(page.getByTestId('canvas-view')).toBeVisible()
  await page.getByTestId('palette-chart').click()
  await page.locator('[data-field=kind] .n-base-selection').click()
  await page.locator('.n-base-select-option', { hasText: 'SPC control chart' }).click()
  await page.getByTestId('dataset-select').click()
  await page.locator('.n-base-select-option', { hasText: 'SPC points' }).first().click()
  await expect(page.getByTestId('ooc-badge')).toHaveText(/\d+ OOC/)
  for (const kind of ['Histogram', 'Box plot', 'Scatter']) {
    await page.locator('[data-field=kind] .n-base-selection').click()
    await page.locator('.n-base-select-option', { hasText: kind }).click()
    await expect(page.getByTestId('chart').locator('canvas')).toHaveCount(1)
  }
  await page.getByTestId('palette-table').click()
  await page.getByTestId('dataset-select').click()
  await page.locator('.n-base-select-option', { hasText: 'Lots' }).first().click()
  await expect(page.getByTestId('table-footer')).toContainText(/rows/)
  await page.locator('.ag-header-cell[col-id=lot_id]').click()
  await page.getByTestId('palette-wafer-map').click()
  await page.locator('[data-param=lot] .n-base-selection').click()
  await page.keyboard.type(lot)
  await expect(page.locator('.n-base-select-option', { hasText: lot }).first()).toBeVisible()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('wafer-tile').first()).toBeVisible()
  await page.getByTestId('palette-data-preview').click()
  await page.getByTestId('dataset-select').click()
  await page.locator('.n-base-select-option', { hasText: 'Tools' }).first().click()
  await page.getByTestId('filter-bar').getByTestId('add-filter').click()
  await page.locator('.n-dropdown-option', { hasText: 'Lot' }).click()
  await page.getByTestId('filter-values').click()
  await page.keyboard.type('A01')
  await expect(page.locator('.n-base-select-option:visible').first()).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByTestId('save-filters').click()
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved')

  // Sharing and restrictions.
  await page.getByTestId('share-button').click()
  await page.getByTestId('share-dialog').getByTestId('user-picker').click()
  await page.keyboard.type('choi')
  await page.locator('.n-base-select-option', { hasText: 's.choi' }).click()
  await page.getByTestId('share-save').click()
  await expect(page.getByTestId('share-dialog')).toBeHidden()
  const node = page.locator('.vue-flow__node-component:has([data-type=data-preview])')
  await node.getByTestId('frame-menu').click()
  await page.locator('.n-dropdown-option', { hasText: 'Restrict access' }).click()
  await page.getByTestId('restrict-edit').click()
  await page.getByTestId('restrict-save').click()
  await expect(page.getByTestId('restrict-dialog')).toBeHidden()

  // Duplicate, then delete the copy.
  await expect(page.locator('.n-dropdown-option:visible')).toHaveCount(0)
  await page.getByTestId('canvas-menu').click()
  await page.locator('.n-dropdown-option:visible', { hasText: 'Duplicate' }).click()
  await page.getByTestId('canvas-name-submit').click()
  await expect(page).not.toHaveURL(/c-yield-review/)
  await expect(page.getByTestId('canvas-title')).toContainText('Copy of')
  await page.getByTestId('canvas-menu').click()
  await page.locator('.n-dropdown-option:visible', { hasText: 'Delete' }).click()
  await page.getByRole('button', { name: 'Delete' }).last().click()
  await expect(page).toHaveURL(/\/$/)

  // Admin.
  for (const path of [
    '/admin/usage',
    '/admin/usage/datasets',
    '/admin/usage/datasets/spc_points',
    '/admin/usage/slow',
    '/admin/health',
    '/admin/audit',
    '/admin/admins',
    '/admin/canvases?deleted=true',
    '/admin/users?user=k.lee',
  ]) {
    await page.goto(path)
    await expect(page.getByTestId('admin-nav')).toBeVisible()
    await expect(page.getByTestId('admin-loading')).toHaveCount(0)
  }
  await page.locator('.n-tabs-tab').first().isVisible()
  await page.goto('/admin/usage/slow?tab=errors')
  await expect(page.getByTestId('errors-table')).toBeVisible()
  // A 4xx error envelope too: a canvas that doesn't exist.
  await page.goto('/canvas/does-not-exist')
  await expect(page.getByText('Canvas not found')).toBeVisible()
  await Promise.all(pending)

  expect(problems).toEqual([])
  // The tour should exercise most of the API surface.
  expect(seen.size).toBeGreaterThanOrEqual(22)
})
