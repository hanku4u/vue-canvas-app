import { test, expect, type Locator, type Page } from '@playwright/test'

// "Weekly yield review" is an empty canvas owned by j.doe (the default dev user), so it
// opens at zoom 100% with flow coordinates equal to pixels from the pane's top-left corner.
// "ET-03 CD excursion" has three seeded placeholders (the third is edit-restricted) and a note.

const EMPTY = 'c-yield-review'
const SEEDED = 'c-et03-excursion'

async function openCanvas(page: Page, id: string): Promise<void> {
  await page.goto(`/canvas/${id}`)
  await expect(page.getByTestId('canvas-view')).toBeVisible()
}

async function pane(page: Page) {
  const box = await page.locator('.vue-flow__pane').boundingBox()
  if (!box) throw new Error('pane not found')
  return box
}

/** Wait for any dropdown/context menu to finish closing (it would intercept pointer events). */
async function menusClosed(page: Page): Promise<void> {
  await expect(page.locator('.n-dropdown-menu')).toHaveCount(0)
}

/** Right-click an empty pane spot (pane-relative) and add a placeholder there. */
async function addPlaceholder(page: Page, x: number, y: number): Promise<void> {
  const origin = await pane(page)
  await page.mouse.click(origin.x + x, origin.y + y, { button: 'right' })
  await page.locator('.n-dropdown-option', { hasText: 'Add placeholder here' }).click()
  await menusClosed(page)
}

const nodes = (page: Page) => page.locator('.vue-flow__node')
const node = (page: Page, title: string) => nodes(page).filter({ hasText: title })
const selected = (page: Page) => page.locator('.vue-flow__node.selected')

async function box(locator: Locator) {
  const value = await locator.boundingBox()
  if (!value) throw new Error('element not visible')
  return value
}

/** Drag a node by its header. */
async function dragBy(page: Page, target: Locator, dx: number, dy: number): Promise<void> {
  const start = await box(target)
  await page.mouse.move(start.x + 40, start.y + 12)
  await page.mouse.down()
  await page.mouse.move(start.x + 40 + dx, start.y + 12 + dy, { steps: 10 })
  await page.mouse.up()
}

/** Horizontal/vertical offset of one node from another, in screen pixels. */
async function offset(a: Locator, b: Locator): Promise<[number, number]> {
  const [boxA, boxB] = [await box(a), await box(b)]
  return [Math.round(boxA.x - boxB.x), Math.round(boxA.y - boxB.y)]
}

async function asUser(page: Page, knoxId: string): Promise<void> {
  await page.addInitScript((id) => localStorage.setItem('dev.knoxId', id), knoxId)
}

test('adds placeholders from the context menu', async ({ page }) => {
  await openCanvas(page, EMPTY)
  await expect(page.getByTestId('canvas-empty')).toBeVisible()
  await expect(page.getByTestId('unsaved-tag')).toHaveCount(0)

  await addPlaceholder(page, 200, 150)
  await expect(nodes(page)).toHaveCount(1)
  await expect(selected(page)).toHaveCount(1)
  await expect(page.getByTestId('canvas-empty')).toHaveCount(0)
  await expect(page.getByTestId('unsaved-tag')).toBeVisible()
})

test('drags snap to the 16px grid unless Alt is held', async ({ page }) => {
  await openCanvas(page, EMPTY)
  await addPlaceholder(page, 200, 150)
  const placeholder = nodes(page).first()
  const origin = await pane(page)
  // Empty canvas → viewport at (0, 0), zoom 1: flow position = offset from the pane origin.
  const flowPos = async () => {
    const b = await box(placeholder)
    return { x: Math.round(b.x - origin.x), y: Math.round(b.y - origin.y) }
  }

  const start = await flowPos()
  await dragBy(page, placeholder, 100, 75)
  const snapped = await flowPos()
  expect(snapped.x % 16).toBe(0)
  expect(snapped.y % 16).toBe(0)
  expect(Math.abs(snapped.x - start.x - 100)).toBeLessThanOrEqual(16)
  expect(Math.abs(snapped.y - start.y - 75)).toBeLessThanOrEqual(16)

  await page.keyboard.down('Alt')
  await dragBy(page, placeholder, 37, 21)
  await page.keyboard.up('Alt')
  // With Alt held the node follows the mouse freely (Vue Flow drops the first few pixels of
  // a drag as the drag starts) and is no longer on the grid.
  const free = await flowPos()
  expect(Math.abs(free.x - snapped.x - 37)).toBeLessThanOrEqual(4)
  expect(Math.abs(free.y - snapped.y - 21)).toBeLessThanOrEqual(4)
  expect(free.x % 16 !== 0 || free.y % 16 !== 0).toBe(true)
})

test('multi-select, nudge with arrows, delete', async ({ page }) => {
  await openCanvas(page, EMPTY)
  await addPlaceholder(page, 100, 100)
  await addPlaceholder(page, 500, 100)
  const [first, second] = [nodes(page).nth(0), nodes(page).nth(1)]

  await first.click({ position: { x: 40, y: 12 } })
  await second.click({ position: { x: 40, y: 12 }, modifiers: ['Shift'] })
  await expect(selected(page)).toHaveCount(2)

  const a0 = await box(first)
  const b0 = await box(second)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Shift+ArrowDown')
  await expect(selected(page)).toHaveCount(2)
  const a1 = await box(first)
  const b1 = await box(second)
  expect([a1.x - a0.x, a1.y - a0.y]).toEqual([16, 160])
  expect([b1.x - b0.x, b1.y - b0.y]).toEqual([16, 160])

  await page.keyboard.press('Delete')
  await expect(nodes(page)).toHaveCount(0)
})

test('box selection, select all and escape', async ({ page }) => {
  await openCanvas(page, EMPTY)
  await addPlaceholder(page, 40, 40)
  await addPlaceholder(page, 400, 40)
  await addPlaceholder(page, 40, 320)
  await page.keyboard.press('Escape')
  await expect(selected(page)).toHaveCount(0)

  // Shift+drag a box around the top two.
  const origin = await pane(page)
  await page.keyboard.down('Shift')
  await page.mouse.move(origin.x + 20, origin.y + 20)
  await page.mouse.down()
  await page.mouse.move(origin.x + 760, origin.y + 290, { steps: 10 })
  await page.mouse.up()
  await page.keyboard.up('Shift')
  await expect(selected(page)).toHaveCount(2)

  await page.keyboard.press('ControlOrMeta+a')
  await expect(selected(page)).toHaveCount(3)
  await page.keyboard.press('Escape')
  await expect(selected(page)).toHaveCount(0)
})

test('resizes with snapping and a minimum size', async ({ page }) => {
  await openCanvas(page, EMPTY)
  await addPlaceholder(page, 100, 100)
  const placeholder = nodes(page).first()
  await expect(placeholder).toContainText('320 × 208')

  const handle = placeholder.locator('.vue-flow__resize-control.handle.bottom.right')
  const h = await box(handle)
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
  await page.mouse.down()
  await page.mouse.move(h.x + h.width / 2 + 50, h.y + h.height / 2 + 30, { steps: 8 })
  await page.mouse.up()
  await expect(placeholder).toContainText('368 × 240')

  const h2 = await box(handle)
  await page.mouse.move(h2.x + h2.width / 2, h2.y + h2.height / 2)
  await page.mouse.down()
  await page.mouse.move(h2.x - 600, h2.y - 600, { steps: 8 })
  await page.mouse.up()
  await expect(placeholder).toContainText('160 × 96')
})

test('bring to front and send to back', async ({ page }) => {
  await openCanvas(page, EMPTY)
  await addPlaceholder(page, 100, 100)
  await addPlaceholder(page, 480, 100)
  const zOf = (locator: Locator) => locator.evaluate((el) => Number(getComputedStyle(el).zIndex))
  const first = node(page, 'Placeholder 1')
  const second = node(page, 'Placeholder 2')
  expect(await zOf(first)).toBeLessThan(await zOf(second))

  await first.click({ position: { x: 40, y: 12 } })
  await page.keyboard.press(']')
  await expect.poll(async () => (await zOf(first)) > (await zOf(second))).toBe(true)

  await menusClosed(page)
  await first.click({ position: { x: 40, y: 12 }, button: 'right' })
  await page.locator('.n-dropdown-option', { hasText: 'Send to back' }).click()
  await expect.poll(async () => (await zOf(first)) < (await zOf(second))).toBe(true)
})

test('zoom controls and shortcuts; viewport persists per canvas', async ({ page }) => {
  const storedZoom = () =>
    page.evaluate(() => {
      const raw = localStorage.getItem('canvas.viewport.c-yield-review')
      return raw ? (JSON.parse(raw) as { zoom: number }).zoom : null
    })

  await openCanvas(page, EMPTY)
  const level = page.getByTestId('zoom-level')
  await expect(level).toHaveText('100%')

  await page.getByTestId('zoom-in').click()
  await expect(level).toHaveText('120%')
  await page.keyboard.press('ControlOrMeta+0')
  await expect(level).toHaveText('100%')
  await expect.poll(storedZoom).toBe(1)

  await page.keyboard.press('-')
  await expect(level).toHaveText('83%')
  // Saved (debounced) after the zoom animation settles, and restored on reload.
  await expect.poll(storedZoom).toBeCloseTo(1 / 1.2, 3)
  await page.reload()
  await expect(page.getByTestId('zoom-level')).toHaveText('83%')
})

test('fits seeded content when opening a canvas for the first time', async ({ page }) => {
  await openCanvas(page, SEEDED)
  await expect(nodes(page)).toHaveCount(4)
  const view = await pane(page)
  for (const element of await nodes(page).all()) {
    const b = await box(element)
    expect(b.x).toBeGreaterThanOrEqual(view.x)
    expect(b.y).toBeGreaterThanOrEqual(view.y)
    expect(b.x + b.width).toBeLessThanOrEqual(view.x + view.width)
    expect(b.y + b.height).toBeLessThanOrEqual(view.y + view.height)
  }
})

test('viewers can look but not move or add', async ({ page }) => {
  await asUser(page, 'm.park')
  await openCanvas(page, SEEDED)
  await expect(nodes(page)).toHaveCount(4)
  await expect(nodes(page).filter({ hasText: 'view only' })).toHaveCount(4)

  // Dragging a node you can't move pans the canvas instead: the layout itself is unchanged.
  const target = node(page, 'Lot table (soon)')
  const reference = node(page, 'SPC – CD_MEAN (soon)')
  const before = await offset(target, reference)
  await dragBy(page, target, 120, 80)
  expect(await offset(target, reference)).toEqual(before)
  await expect(page.getByTestId('unsaved-tag')).toHaveCount(0)

  const origin = await pane(page)
  await page.mouse.click(origin.x + 5, origin.y + origin.height - 5, { button: 'right' })
  await expect(page.locator('.n-dropdown-option', { hasText: 'Select all' })).toBeVisible()
  await expect(page.locator('.n-dropdown-option', { hasText: 'Add placeholder' })).toHaveCount(0)
})

test('editors cannot change edit-restricted components', async ({ page }) => {
  await asUser(page, 'k.lee')
  await openCanvas(page, SEEDED)
  const locked = node(page, 'Wafer maps (soon)')
  const open = node(page, 'Lot table (soon)')
  await expect(locked).toContainText('view only')
  await expect(open).not.toContainText('view only')

  const before = await offset(locked, open)
  await dragBy(page, locked, 100, 100)
  expect(await offset(locked, open)).toEqual(before)

  await locked.click({ position: { x: 40, y: 12 } })
  await page.keyboard.press('Delete')
  await expect(nodes(page)).toHaveCount(4)
})
