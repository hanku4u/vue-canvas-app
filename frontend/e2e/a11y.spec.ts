import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// F13: automated accessibility checks (axe, WCAG 2 A/AA) on the main screens and dialogs,
// in light and dark mode. Serious and critical violations fail the test.

async function audit(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    // Dev-only Vue devtools button, not part of the app.
    .exclude('.panel-entry-btn')
    .exclude('#__vue-devtools-container__')
    .analyze()
  return result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map(
      (v) =>
        `${v.id}: ${v.help} (${v.nodes
          .map((n) => n.target.join(' '))
          .slice(0, 3)
          .join(' ; ')})`,
    )
}

const PAGES: { name: string; url: string; ready: (page: Page) => Promise<void> }[] = [
  {
    name: 'home',
    url: '/',
    ready: (p) => expect(p.locator('[data-testid^=canvas-card-]').first()).toBeVisible(),
  },
  {
    name: 'canvas',
    url: '/canvas/c-et03-excursion',
    ready: (p) => expect(p.locator('.vue-flow__node-component')).toHaveCount(4),
  },
  {
    name: 'empty canvas with tips',
    url: '/canvas/c-yield-review',
    ready: (p) => expect(p.getByTestId('first-run-hints')).toBeVisible(),
  },
  {
    name: 'admin usage',
    url: '/admin/usage',
    ready: (p) => expect(p.getByTestId('admin-chart').first()).toBeVisible(),
  },
  {
    name: 'admin canvases',
    url: '/admin/canvases',
    ready: (p) => expect(p.getByTestId('canvases-table')).toBeVisible(),
  },
  {
    name: 'admin health',
    url: '/admin/health',
    ready: (p) => expect(p.getByTestId('health-app')).toBeVisible(),
  },
]

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} mode`, () => {
    test.use({ colorScheme: scheme })

    for (const { name, url, ready } of PAGES) {
      test(`${name} has no serious accessibility violations`, async ({ page }) => {
        await page.goto(url)
        await ready(page)
        expect(await audit(page)).toEqual([])
      })
    }

    test('dialogs have no serious accessibility violations', async ({ page }) => {
      await page.goto('/canvas/c-et03-excursion')
      await page.getByTestId('shortcuts-button').click()
      await expect(page.getByTestId('shortcuts-dialog')).toBeVisible()
      // Audit after the fade-in: mid-transition opacity lowers measured contrast.
      await expect(page.locator('.n-modal-container .n-modal')).toHaveCSS('opacity', '1')
      expect(await audit(page)).toEqual([])
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('shortcuts-dialog')).toBeHidden()
      await page.getByTestId('share-button').click()
      await expect(page.getByTestId('share-row').first()).toBeVisible()
      await expect(page.locator('.n-modal-container .n-modal')).toHaveCSS('opacity', '1')
      expect(await audit(page)).toEqual([])
    })
  })
}
