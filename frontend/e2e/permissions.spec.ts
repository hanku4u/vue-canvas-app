import { test, expect, type Page } from '@playwright/test'

// F11: the "Who can do what" table (docs/permissions.md), walked per role, plus sharing,
// restrictions and duplication. Seeds (src/mocks/db.ts):
//   c-et03-excursion  owner j.doe (also admin) · k.lee editor · m.park viewer
//                     "Wafer maps (soon)" is edit-restricted with an empty ACL
//   c-litho-weekly    owner k.lee · j.doe viewer share (but admin)
//   c-cmp-monitor     owner m.park · k.lee editor · "Supplier notes" view-restricted

/** Act as a dev user (the mock database stays: it lives in this context's storage). */
async function asUser(page: Page, knoxId: string): Promise<void> {
  if (page.url() === 'about:blank') await page.goto('/')
  await page.evaluate((id) => localStorage.setItem('dev.knoxId', id), knoxId)
}

const switchUser = asUser

async function openCanvas(page: Page, id: string): Promise<void> {
  await page.goto(`/canvas/${id}`)
  await expect(page.getByTestId('canvas-view')).toBeVisible()
}

const nodes = (page: Page) => page.locator('.vue-flow__node-component')
const node = (page: Page, title: string) => nodes(page).filter({ hasText: title })

async function canvasMenu(page: Page): Promise<string[]> {
  await page.getByTestId('canvas-menu').click()
  const items = page.locator('.n-dropdown-option')
  await expect(items.first()).toBeVisible()
  const labels = (await items.allTextContents()).map((t) => t.trim())
  await page.keyboard.press('Escape')
  return labels.filter((l) => !l.includes('(dev)'))
}

interface Case {
  role: string
  user: string
  canvas: string
  tag: string
  /** Visible components. */
  components: number
  edit: boolean
  manage: boolean
  menu: string[]
}

const CASES: Case[] = [
  {
    role: 'owner',
    user: 'm.park',
    canvas: 'c-cmp-monitor',
    tag: 'Owner',
    components: 2,
    edit: true,
    manage: true,
    menu: ['Share…', 'Rename', 'Duplicate', 'Delete'],
  },
  {
    role: 'admin',
    user: 'j.doe',
    canvas: 'c-litho-weekly',
    tag: 'Admin access',
    components: 0,
    edit: true,
    manage: true,
    menu: ['Share…', 'Rename', 'Duplicate to my canvases', 'Delete'],
  },
  {
    role: 'editor',
    user: 'k.lee',
    canvas: 'c-et03-excursion',
    tag: 'Editor',
    components: 4,
    edit: true,
    manage: false,
    menu: ['Rename', 'Duplicate to my canvases'],
  },
  {
    role: 'editor without view access to a hidden component',
    user: 'k.lee',
    canvas: 'c-cmp-monitor',
    tag: 'Editor',
    components: 1,
    edit: true,
    manage: false,
    menu: ['Rename', 'Duplicate to my canvases'],
  },
  {
    role: 'viewer',
    user: 'm.park',
    canvas: 'c-et03-excursion',
    tag: 'View only',
    components: 4,
    edit: false,
    manage: false,
    menu: ['Duplicate to my canvases'],
  },
]

for (const c of CASES) {
  test(`permissions: ${c.role} (${c.user} on ${c.canvas})`, async ({ page }) => {
    await asUser(page, c.user)
    await openCanvas(page, c.canvas)
    await expect(page.getByTestId('canvas-role')).toHaveText(c.tag)
    await expect(nodes(page)).toHaveCount(c.components)

    // Add components and groups: palette and undo/redo only for editors.
    await expect(page.getByTestId('palette-note')).toHaveCount(c.edit ? 1 : 0)
    await expect(page.getByTestId('undo')).toHaveCount(c.edit ? 1 : 0)
    // Share and restrict: owner and admins.
    await expect(page.getByTestId('share-button')).toHaveCount(c.manage ? 1 : 0)
    await expect(page.getByTestId('duplicate-mine')).toHaveCount(c.tag === 'View only' ? 1 : 0)
    expect(await canvasMenu(page)).toEqual(c.menu)

    // Session filters work for everyone.
    await page.getByTestId('add-filter').first().click()
    await page.locator('.n-dropdown-option', { hasText: 'Chamber' }).click()
    await page.getByTestId('filter-values').click()
    await page.locator('.n-base-select-option', { hasText: 'C' }).first().click()
    await page.keyboard.press('Escape')
    await expect(page).toHaveURL(/f\.chamber=C/)
  })
}

test('only the owner and admins can restrict components', async ({ page }) => {
  for (const [user, count] of [
    ['j.doe', 1],
    ['k.lee', 0],
  ] as const) {
    await asUser(page, user)
    await openCanvas(page, 'c-et03-excursion')
    await node(page, 'Lot table (soon)').getByTestId('frame-menu').click()
    await expect(page.locator('.n-dropdown-option', { hasText: 'Delete' })).toBeVisible()
    await expect(page.locator('.n-dropdown-option', { hasText: 'Restrict access' })).toHaveCount(
      count,
    )
    await page.keyboard.press('Escape')
  }
})

test('no access: the canvas is reported as not found', async ({ page }) => {
  await asUser(page, 's.choi')
  await page.goto('/canvas/c-et03-excursion')
  await expect(page.getByText('Canvas not found')).toBeVisible()
})

test('the owner shares a canvas; the new viewer gets view-only access', async ({ page }) => {
  await asUser(page, 'm.park')
  await openCanvas(page, 'c-cmp-monitor')
  await page.getByTestId('share-button').click()
  const dialog = page.getByTestId('share-dialog')
  await expect(dialog.getByTestId('share-row')).toHaveCount(1) // k.lee
  await dialog.getByTestId('user-picker').click()
  await page.keyboard.type('choi')
  await page.locator('.n-base-select-option', { hasText: 's.choi' }).click()
  await expect(dialog.locator('[data-user="s.choi"]')).toContainText('Can view')
  // Make k.lee a viewer too.
  await dialog.locator('[data-user="k.lee"] .n-base-selection').click()
  await page.locator('.n-base-select-option', { hasText: 'Can view' }).click()
  await dialog.getByTestId('share-save').click()
  await expect(dialog).toBeHidden()

  await switchUser(page, 's.choi')
  await openCanvas(page, 'c-cmp-monitor')
  await expect(page.getByTestId('canvas-role')).toHaveText('View only')
  await expect(nodes(page)).toHaveCount(1) // "Supplier notes" stays hidden
  await switchUser(page, 'k.lee')
  await openCanvas(page, 'c-cmp-monitor')
  await expect(page.getByTestId('canvas-role')).toHaveText('View only')
})

test('the owner hides a component; ACL entries bring it back for one person', async ({ page }) => {
  await asUser(page, 'm.park')
  await openCanvas(page, 'c-cmp-monitor')
  await expect(node(page, 'Supplier notes').getByTestId('frame-hidden')).toBeVisible()

  // Restrict "CMP notes" to m.park only.
  await node(page, 'CMP notes').getByTestId('frame-menu').click()
  await page.locator('.n-dropdown-option', { hasText: 'Restrict access' }).click()
  const dialog = page.getByTestId('restrict-dialog')
  await dialog.getByTestId('restrict-view').click()
  await expect(dialog.getByTestId('restrict-summary')).toContainText('won’t know it exists')
  await dialog.getByTestId('restrict-save').click()
  await expect(dialog).toBeHidden()
  await expect(node(page, 'CMP notes').getByTestId('frame-hidden')).toBeVisible()

  await switchUser(page, 'k.lee')
  await openCanvas(page, 'c-cmp-monitor')
  await expect(nodes(page)).toHaveCount(0)

  // Give k.lee view access to "Supplier notes".
  await switchUser(page, 'm.park')
  await openCanvas(page, 'c-cmp-monitor')
  await node(page, 'Supplier notes').getByTestId('frame-menu').click()
  await page.locator('.n-dropdown-option', { hasText: 'Restrict access' }).click()
  await expect(dialog.getByTestId('restrict-view')).toHaveClass(/n-checkbox--checked/)
  await dialog.getByTestId('user-picker').click()
  await page.keyboard.type('k.lee')
  await page.locator('.n-base-select-option', { hasText: 'k.lee' }).click()
  await expect(dialog.getByTestId('acl-row')).toHaveCount(1)
  await dialog.getByTestId('restrict-save').click()
  await expect(dialog).toBeHidden()

  await switchUser(page, 'k.lee')
  await openCanvas(page, 'c-cmp-monitor')
  await expect(nodes(page)).toHaveCount(1)
  // Only viewing was restricted, so k.lee (a canvas editor) may also edit it.
  await expect(node(page, 'Supplier notes')).not.toContainText('view only')
})

test('lock a component against editors, then unlock it', async ({ page }) => {
  await asUser(page, 'j.doe')
  await openCanvas(page, 'c-et03-excursion')
  await node(page, 'Lot table (soon)').getByTestId('frame-menu').click()
  await page.locator('.n-dropdown-option', { hasText: 'Restrict access' }).click()
  const dialog = page.getByTestId('restrict-dialog')
  await dialog.getByTestId('restrict-edit').click()
  await dialog.getByTestId('restrict-save').click()
  await expect(dialog).toBeHidden()
  await expect(node(page, 'Lot table (soon)').getByTestId('frame-lock')).toBeVisible()

  await switchUser(page, 'k.lee')
  await openCanvas(page, 'c-et03-excursion')
  await expect(node(page, 'Lot table (soon)')).toContainText('view only')
  await expect(node(page, 'SPC – CD_MEAN (soon)')).not.toContainText('view only')
})

test('a viewer duplicates the canvas to their own canvases', async ({ page }) => {
  await asUser(page, 'm.park')
  await openCanvas(page, 'c-et03-excursion')
  await page.getByTestId('duplicate-mine').click()
  await page.getByTestId('canvas-name-submit').click()
  await expect(page).not.toHaveURL(/c-et03-excursion/)
  await expect(page.getByTestId('canvas-role')).toHaveText('Owner')
  await expect(page.getByTestId('canvas-title')).toHaveText('Copy of ET-03 CD excursion')
  await expect(nodes(page)).toHaveCount(4)
  // Restrictions are dropped: the copy of the locked component is editable.
  await expect(nodes(page).filter({ hasText: 'view only' })).toHaveCount(0)
})
