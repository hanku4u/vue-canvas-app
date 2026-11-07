import { test, expect } from '@playwright/test'

test('home page loads the current user from the mocked API', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('signed-in')).toContainText('j.doe')
  await expect(page.getByText('API: in-browser mock')).toBeVisible()
})

test('dev identity switch changes the signed-in user', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.setItem('dev.knoxId', 'k.lee'))
  await page.reload()
  await expect(page.getByTestId('signed-in')).toContainText('k.lee')
  await expect(page.getByTestId('signed-in')).not.toContainText('admin')
})
