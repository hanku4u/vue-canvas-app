import { test, expect, type Page } from '@playwright/test'

// Each test gets a fresh browser context, so the MSW mock starts from its seed data:
// j.doe owns 2 canvases and can view "Litho weekly" (owned by k.lee).

const mine = (page: Page) => page.getByTestId('section-mine')
const shared = (page: Page) => page.getByTestId('section-shared')

async function openCardMenu(page: Page, title: string): Promise<void> {
  await page.getByRole('article', { name: title }).getByTestId('canvas-card-menu').click()
}

async function chooseMenuItem(page: Page, label: string): Promise<void> {
  // A submenu's parent option contains the child options in the DOM, so take the innermost match.
  await page.locator('.n-dropdown-option', { hasText: label }).last().click()
}

test('lists owned and shared canvases', async ({ page }) => {
  await page.goto('/')
  await expect(mine(page).getByRole('article')).toHaveCount(2)
  await expect(mine(page)).toContainText('ET-03 CD excursion')
  await expect(shared(page).getByRole('article')).toHaveCount(1)
  await expect(shared(page)).toContainText('Litho weekly')
  await expect(shared(page)).toContainText('by Kim Lee')
  await expect(page.getByTestId('admin-link')).toBeVisible()
})

test('search filters both sections', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('canvas-search').locator('input').fill('litho')
  await expect(mine(page)).toContainText('No canvases match your search')
  await expect(shared(page).getByRole('article')).toHaveCount(1)
})

test('creates a canvas and opens it', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('new-canvas').click()
  await page.getByTestId('canvas-title-input').locator('input').fill('Overlay drift on LI-02')
  await page.getByTestId('canvas-name-submit').click()

  await expect(page).toHaveURL(/\/canvas\/.+/)
  await expect(page.getByTestId('canvas-title')).toHaveText('Overlay drift on LI-02')
  await expect(page.getByTestId('editor-placeholder')).toBeVisible()

  await page.getByRole('button', { name: 'Back to canvases' }).click()
  await expect(mine(page).getByRole('article')).toHaveCount(3)

  // Survives a reload (mock data is persisted in localStorage).
  await page.reload()
  await expect(mine(page)).toContainText('Overlay drift on LI-02')
})

test('requires a title', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('new-canvas').click()
  await page.getByTestId('canvas-name-submit').click()
  await expect(page.getByText('Enter a title')).toBeVisible()
})

test('renames, duplicates and deletes from the card menu', async ({ page }) => {
  await page.goto('/')

  await openCardMenu(page, 'Weekly yield review')
  await chooseMenuItem(page, 'Rename')
  const title = page.getByTestId('canvas-title-input').locator('input')
  await expect(title).toHaveValue('Weekly yield review')
  await title.fill('Yield review W45')
  await page.getByTestId('canvas-name-submit').click()
  await expect(mine(page)).toContainText('Yield review W45')

  await openCardMenu(page, 'Yield review W45')
  await chooseMenuItem(page, 'Duplicate')
  await expect(title).toHaveValue('Copy of Yield review W45')
  await page.getByTestId('canvas-name-submit').click()
  await expect(page.getByTestId('canvas-title')).toHaveText('Copy of Yield review W45')
  await page.getByRole('button', { name: 'Back to canvases' }).click()
  await expect(mine(page).getByRole('article')).toHaveCount(3)

  await openCardMenu(page, 'Copy of Yield review W45')
  await chooseMenuItem(page, 'Delete')
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(mine(page).getByRole('article')).toHaveCount(2)
  await expect(mine(page)).not.toContainText('Copy of Yield review W45')
})

test('viewers only get open and duplicate', async ({ page }) => {
  await page.goto('/')
  await openCardMenu(page, 'Litho weekly')
  const options = page.locator('.n-dropdown-option')
  await expect(options).toHaveText(['Open', 'Duplicate'])
})

test('switching user changes canvases and admin access', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('user-menu').click()
  await page.locator('.n-dropdown-option', { hasText: 'Switch user (dev)' }).hover()
  await chooseMenuItem(page, 'k.lee')

  await expect(page.getByTestId('admin-link')).toHaveCount(0)
  await expect(mine(page)).toContainText('Litho weekly')
  await expect(shared(page).getByRole('article')).toHaveCount(2)

  await page.goto('/admin')
  await expect(page.getByTestId('status-403')).toBeVisible()
})

test('admins can open the admin area', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('admin-link').click()
  await expect(page.getByTestId('admin-placeholder')).toBeVisible()
})

test('unknown canvases and routes show not found', async ({ page }) => {
  await page.goto('/canvas/does-not-exist')
  await expect(page.getByText('Canvas not found')).toBeVisible()
  await page.goto('/nope')
  await expect(page.getByTestId('status-404')).toBeVisible()
  await page.getByRole('button', { name: 'Back to canvases' }).click()
  await expect(mine(page).getByRole('article')).toHaveCount(2)
})
