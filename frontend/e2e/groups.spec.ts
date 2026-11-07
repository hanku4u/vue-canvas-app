import { test, expect, type Locator, type Page } from '@playwright/test'

// F5: groups. "ET-03 CD excursion" has placeholders SPC (0,0), Lot table (352,0),
// Wafer maps (0,240, edit-restricted) and a note (352,240).

const SEEDED = 'c-et03-excursion'
const EMPTY = 'c-yield-review'

async function openCanvas(page: Page, id: string): Promise<void> {
  await page.goto(`/canvas/${id}`)
  await expect(page.getByTestId('canvas-view')).toBeVisible()
}

const node = (page: Page, title: string) => page.locator('.vue-flow__node', { hasText: title })
const groupNode = (page: Page) => page.locator('.vue-flow__node-group')
const SPC = 'SPC – CD_MEAN (soon)'
const LOT = 'Lot table (soon)'

async function box(locator: Locator) {
  const value = await locator.boundingBox()
  if (!value) throw new Error('element not visible')
  return value
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 15 })
  await page.mouse.up()
}

async function saved(page: Page): Promise<void> {
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved')
}

/** Select SPC and Lot table and group them with Ctrl/⌘+G. */
async function groupTwo(page: Page): Promise<void> {
  await node(page, SPC).locator('.frame__header').click()
  await node(page, LOT)
    .locator('.frame__header')
    .click({ modifiers: ['Shift'] })
  await page.keyboard.press('ControlOrMeta+g')
  await expect(groupNode(page)).toHaveCount(1)
}

test('Ctrl/⌘+G groups the selection in a frame that persists', async ({ page }) => {
  await openCanvas(page, SEEDED)
  const spcBefore = await box(node(page, SPC))
  await groupTwo(page)

  const frame = await box(groupNode(page))
  const spc = await box(node(page, SPC))
  const lot = await box(node(page, LOT))
  // Children don't move, and the frame wraps them.
  expect(spc).toEqual(spcBefore)
  for (const child of [spc, lot]) {
    expect(child.x).toBeGreaterThan(frame.x)
    expect(child.y).toBeGreaterThan(frame.y + 40)
    expect(child.x + child.width).toBeLessThan(frame.x + frame.width)
    expect(child.y + child.height).toBeLessThan(frame.y + frame.height)
  }
  await expect(page.getByTestId('group-count')).toHaveText('2')
  await expect(groupNode(page)).toHaveClass(/selected/)
  await expect(page.getByTestId('inspector-group-contents')).toContainText('2 components')

  await saved(page)
  await page.reload()
  await expect(groupNode(page)).toHaveCount(1)
  await expect(page.getByTestId('group-count')).toHaveText('2')
})

test('moving the group moves its contents; undo moves them back', async ({ page }) => {
  await openCanvas(page, SEEDED)
  await groupTwo(page)
  const frame = await box(groupNode(page))
  const spc = await box(node(page, SPC))

  await drag(page, { x: frame.x + 200, y: frame.y + 20 }, { x: frame.x + 200, y: frame.y + 180 })
  const moved = (await box(groupNode(page))).y - frame.y
  expect(moved).toBeGreaterThan(100)
  expect(Math.round((await box(node(page, SPC))).y - spc.y)).toBe(Math.round(moved))

  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => Math.round((await box(node(page, SPC))).y)).toBe(Math.round(spc.y))
})

test('collapse hides the contents and is saved', async ({ page }) => {
  await openCanvas(page, SEEDED)
  await groupTwo(page)
  const fullHeight = (await box(groupNode(page))).height

  await page.getByTestId('group-collapse').click()
  await expect(node(page, SPC)).toHaveCount(0)
  expect((await box(groupNode(page))).height).toBe(40)
  await saved(page)

  await page.reload()
  await expect(groupNode(page)).toHaveCount(1)
  await expect(node(page, SPC)).toHaveCount(0)
  await page.getByTestId('group-collapse').click()
  await expect(node(page, SPC)).toBeVisible()
  expect((await box(groupNode(page))).height).toBe(fullHeight)
})

test('dragging components onto and off the frame changes membership', async ({ page }) => {
  await openCanvas(page, SEEDED)
  await groupTwo(page)
  const count = page.getByTestId('group-count')
  const note = node(page, 'Investigation notes')

  // Drop the note in the middle of the frame (by its header).
  const frame = await box(groupNode(page))
  const n = await box(note)
  await drag(
    page,
    { x: n.x + 60, y: n.y + 14 },
    { x: frame.x + frame.width / 2 - 100, y: frame.y + 120 },
  )
  await expect(count).toHaveText('3')

  // And back out, far below the frame.
  const inside = await box(note)
  await drag(
    page,
    { x: inside.x + 60, y: inside.y + 14 },
    { x: inside.x + 60, y: frame.y + frame.height + 300 },
  )
  await expect(count).toHaveText('2')
})

test('rename by double-clicking the title', async ({ page }) => {
  await openCanvas(page, SEEDED)
  await groupTwo(page)
  await page.getByTestId('group-title').dblclick()
  const input = page.getByTestId('group-title-input')
  await input.fill('Chamber C')
  await input.press('Enter')
  await expect(page.getByTestId('group-title')).toHaveText('Chamber C')
  await expect(page.getByTestId('inspector-group-title').locator('input')).toHaveValue('Chamber C')
})

test('ungroup and Delete keep the contents in place', async ({ page }) => {
  await openCanvas(page, SEEDED)
  await groupTwo(page)
  const spc = await box(node(page, SPC))
  await page.keyboard.press('ControlOrMeta+Shift+g')
  await expect(groupNode(page)).toHaveCount(0)
  expect(await box(node(page, SPC))).toEqual(spc)

  await page.keyboard.press('ControlOrMeta+z')
  await expect(groupNode(page)).toHaveCount(1)
  await groupNode(page).locator('.group__header').click()
  await page.keyboard.press('Delete')
  await expect(groupNode(page)).toHaveCount(0)
  await expect(node(page, SPC)).toHaveCount(1)
})

test('delete group and contents, then undo', async ({ page }) => {
  await openCanvas(page, SEEDED)
  await groupTwo(page)
  await page.getByTestId('group-menu').click()
  await page.locator('.n-dropdown-option', { hasText: 'Delete group and contents' }).click()
  await expect(groupNode(page)).toHaveCount(0)
  await expect(node(page, SPC)).toHaveCount(0)
  await expect(node(page, LOT)).toHaveCount(0)

  await page.keyboard.press('ControlOrMeta+z')
  await expect(groupNode(page)).toHaveCount(1)
  await expect(page.getByTestId('group-count')).toHaveText('2')
  await saved(page)
  await page.reload()
  await expect(page.getByTestId('group-count')).toHaveText('2')
})

test('dropping from the palette into a group adds the component to it', async ({ page }) => {
  await openCanvas(page, SEEDED)
  await groupTwo(page)
  const frame = await box(groupNode(page))
  const pane = await box(page.locator('.vue-flow__pane'))
  await page.getByTestId('palette-note').dragTo(page.locator('.vue-flow__pane'), {
    targetPosition: { x: frame.x - pane.x + 120, y: frame.y - pane.y + 140 },
  })
  await expect(page.getByTestId('group-count')).toHaveText('3')
})

test('editors cannot group or delete components that are locked for them', async ({ page }) => {
  // The owner groups SPC with "Wafer maps" (edit-restricted: locked for editors).
  await openCanvas(page, SEEDED)
  await node(page, SPC).locator('.frame__header').click()
  await node(page, 'Wafer maps (soon)')
    .locator('.frame__header')
    .click({ modifiers: ['Shift'] })
  await page.keyboard.press('ControlOrMeta+g')
  await expect(groupNode(page)).toHaveCount(1)
  await saved(page)

  // As k.lee (editor): the locked component can't be put in a new group...
  await page.evaluate(() => localStorage.setItem('dev.knoxId', 'k.lee'))
  await page.reload()
  await node(page, 'Wafer maps (soon)').locator('.frame__header').click()
  await page.keyboard.press('ControlOrMeta+g')
  await expect(page.locator('.n-message', { hasText: 'locked' })).toBeVisible()

  // ...and the group holding it can't be deleted with its contents.
  await page.getByTestId('group-menu').click()
  await page.locator('.n-dropdown-option', { hasText: 'Delete group and contents' }).click()
  await expect(page.locator('.n-message', { hasText: 'cannot edit' })).toBeVisible()
  await expect(groupNode(page)).toHaveCount(1)
  await expect(page.getByTestId('group-count')).toHaveText('2')

  // Ungrouping is allowed: the group's layout belongs to its editors.
  await page.getByTestId('group-menu').click()
  await page.locator('.n-dropdown-option', { hasText: 'Ungroup' }).click()
  await expect(groupNode(page)).toHaveCount(0)
  await saved(page)
})

test('viewers can collapse nothing and have no group menu', async ({ page }) => {
  // Build a group as the owner, then look at it as a viewer.
  await openCanvas(page, SEEDED)
  await groupTwo(page)
  await saved(page)
  await page.evaluate(() => localStorage.setItem('dev.knoxId', 'm.park'))
  await page.reload()
  await expect(groupNode(page)).toHaveCount(1)
  await expect(page.getByTestId('group-menu')).toHaveCount(0)
  await expect(page.getByTestId('group-collapse')).toBeDisabled()
})

test('new canvases can be grouped from the context menu', async ({ page }) => {
  await openCanvas(page, EMPTY)
  await page.getByTestId('palette-note').click()
  await page.keyboard.press('Escape')
  const note = page.locator('.vue-flow__node').first()
  await note.locator('.frame__header').click({ button: 'right' })
  await page.locator('.n-dropdown-option', { hasText: 'Group' }).first().click()
  await expect(groupNode(page)).toHaveCount(1)
})
