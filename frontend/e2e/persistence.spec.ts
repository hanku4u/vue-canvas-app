import { test, expect, type Locator, type Page } from '@playwright/test'

// F4: saving through ops, undo/redo, conflicts, remote merge, offline, copy/paste.
// Two pages in one browser context share localStorage, and the mock backend keeps its
// data there, so two tabs behave like two clients of one server.

const EMPTY = 'c-yield-review'
const SEEDED = 'c-et03-excursion'
const OTHER = 'c-et03-excursion'

async function openCanvas(page: Page, id: string): Promise<void> {
  await page.goto(`/canvas/${id}`)
  await expect(page.getByTestId('canvas-view')).toBeVisible()
}

const nodes = (page: Page) => page.locator('.vue-flow__node')
const notes = (page: Page) => nodes(page).filter({ has: page.locator('[data-type=note]') })
const status = (page: Page) => page.getByTestId('save-status')

async function saved(page: Page): Promise<void> {
  await expect(status(page)).toHaveAttribute('data-status', 'saved')
}

async function box(locator: Locator) {
  const value = await locator.boundingBox()
  if (!value) throw new Error('element not visible')
  return value
}

async function dragHeader(page: Page, target: Locator, dx: number, dy: number): Promise<void> {
  const b = await box(target)
  await page.mouse.move(b.x + 60, b.y + 14)
  await page.mouse.down()
  await page.mouse.move(b.x + 60 + dx, b.y + 14 + dy, { steps: 10 })
  await page.mouse.up()
}

async function writeNote(page: Page, note: Locator, text: string): Promise<void> {
  await note.getByTestId('note').dblclick()
  await page.getByTestId('note-editor').fill(text)
  await page.getByTestId('note-editor').press('ControlOrMeta+Enter')
}

/** Simulate returning to the tab (TanStack Query refetches on visibility change). */
async function refocus(page: Page): Promise<void> {
  await page.evaluate(() => {
    // TanStack Query listens on window (the event doesn't bubble from document).
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    window.dispatchEvent(new Event('visibilitychange'))
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    window.dispatchEvent(new Event('visibilitychange'))
  })
}

test('edits are saved automatically and survive a reload', async ({ page }) => {
  await openCanvas(page, EMPTY)
  await saved(page)
  await page.getByTestId('palette-note').click()
  const note = notes(page).first()
  await writeNote(page, note, '# Persisted')
  await expect(status(page)).toHaveAttribute('data-status', /pending|saving/)
  await saved(page)
  const before = await box(note)

  await page.reload()
  await expect(notes(page).first().locator('h1')).toHaveText('Persisted')
  expect(await box(notes(page).first())).toEqual(before)
})

test('undo and redo cover add, edit, move and delete', async ({ page }) => {
  await openCanvas(page, EMPTY)
  await expect(page.getByTestId('undo')).toBeDisabled()

  await page.getByTestId('palette-note').click()
  const note = notes(page).first()
  await writeNote(page, note, 'v1')
  await page.keyboard.press('Escape')
  const start = await box(note)
  await dragHeader(page, note, 160, 0)
  await expect.poll(async () => Math.round((await box(note)).x - start.x)).toBeGreaterThan(100)

  await page.keyboard.press('ControlOrMeta+z') // move
  await expect.poll(async () => (await box(note)).x).toBe(start.x)
  await page.keyboard.press('ControlOrMeta+z') // text
  await expect(note).toContainText('Double-click to write a note')
  await page.keyboard.press('ControlOrMeta+z') // add
  await expect(notes(page)).toHaveCount(0)

  await page.getByTestId('redo').click()
  await expect(notes(page)).toHaveCount(1)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect(notes(page).first()).toContainText('v1')

  // Delete, undo the delete: the note is back with its text, and saved that way.
  await notes(page).first().locator('.frame__header').click()
  await page.keyboard.press('Delete')
  await expect(notes(page)).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+z')
  await expect(notes(page).first()).toContainText('v1')
  await saved(page)
  await page.reload()
  await expect(notes(page).first()).toContainText('v1')
})

test('two tabs editing different components do not conflict', async ({ context }) => {
  const a = await context.newPage()
  const b = await context.newPage()
  await openCanvas(a, SEEDED)
  await openCanvas(b, SEEDED)

  await dragHeader(a, a.locator('.vue-flow__node', { hasText: 'SPC – CD_MEAN (soon)' }), -96, 0)
  await saved(a)
  const lotTableInB = b.locator('.vue-flow__node', { hasText: 'Lot table (soon)' })
  const startInB = await box(lotTableInB)
  await dragHeader(b, lotTableInB, 96, 0)
  await saved(b)
  const movedInB = Math.round((await box(lotTableInB)).x - startInB.x)
  expect(movedInB).toBeGreaterThan(48)

  // Coming back to tab A merges B's change.
  const lotTableInA = a.locator('.vue-flow__node', { hasText: 'Lot table (soon)' })
  const before = await box(lotTableInA)
  await refocus(a)
  await expect.poll(async () => Math.round((await box(lotTableInA)).x - before.x)).toBe(movedInB)
  await expect(a.getByTestId('conflict-dialog')).toHaveCount(0)
})

test('editing a component someone else changed shows a conflict', async ({ context }) => {
  const a = await context.newPage()
  const b = await context.newPage()
  await openCanvas(a, SEEDED)
  await openCanvas(b, SEEDED)
  const title = 'SPC – CD_MEAN (soon)'

  await dragHeader(a, a.locator('.vue-flow__node', { hasText: title }), 0, 96)
  await saved(a)

  // B still has the old version and moves the same component.
  const inB = b.locator('.vue-flow__node', { hasText: title })
  await dragHeader(b, inB, 160, 0)
  await expect(b.getByTestId('conflict-dialog')).toBeVisible()
  await expect(b.getByTestId('conflict-dialog')).toContainText(title)
  await expect(status(b)).toHaveAttribute('data-status', 'conflict')

  // Keep theirs: B shows A's position.
  const posInA = await box(a.locator('.vue-flow__node', { hasText: title }))
  await b.getByTestId('conflict-keep-theirs').click()
  await saved(b)
  const posInB = await box(inB)
  const paneA = await box(a.locator('.vue-flow__pane'))
  const paneB = await box(b.locator('.vue-flow__pane'))
  expect(Math.round(posInB.y - paneB.y)).toBe(Math.round(posInA.y - paneA.y))
})

test('reapply mine overwrites the other change', async ({ page }) => {
  await openCanvas(page, SEEDED)
  // The dev menu moves the first component on the server, as k.lee.
  await page.getByTestId('canvas-menu').click()
  await page.locator('.n-dropdown-option', { hasText: 'Simulate edit' }).click()

  const target = page.locator('.vue-flow__node', { hasText: 'SPC – CD_MEAN (soon)' })
  await target.locator('.frame__header').click()
  await page.getByTestId('inspector-title').locator('input').fill('Mine wins')
  await page.getByTestId('inspector-title').locator('input').press('Enter')
  await expect(page.getByTestId('conflict-dialog')).toContainText('changed by k.lee')
  await page.getByTestId('conflict-reapply-mine').click()
  await saved(page)

  await page.reload()
  await expect(page.locator('.vue-flow__node', { hasText: 'Mine wins' })).toHaveCount(1)
})

test('goes offline when saving fails and catches up later', async ({ page }) => {
  await openCanvas(page, EMPTY)
  await page.evaluate(() => localStorage.setItem('mock.failOps', 'network'))
  await page.getByTestId('palette-note').click()
  await expect(status(page)).toHaveAttribute('data-status', 'offline')
  await expect(status(page)).toContainText('Offline')

  await page.evaluate(() => localStorage.removeItem('mock.failOps'))
  await status(page).click() // retry now instead of waiting for the backoff
  await saved(page)
  await page.reload()
  await expect(notes(page)).toHaveCount(1)
})

test('copy and paste works across canvases', async ({ page }) => {
  await openCanvas(page, SEEDED)
  const seededNote = notes(page).first()
  await seededNote.locator('.frame__header').click()
  await page.keyboard.press('ControlOrMeta+c')

  await openCanvas(page, EMPTY)
  const pane = await box(page.locator('.vue-flow__pane'))
  await page.mouse.move(pane.x + 200, pane.y + 150)
  await page.keyboard.press('ControlOrMeta+v')
  await expect(notes(page)).toHaveCount(1)
  await expect(notes(page).first()).toContainText('Hypothesis')
  const pasted = await box(notes(page).first())
  expect(Math.abs(pasted.x - (pane.x + 200))).toBeLessThanOrEqual(16)

  // Cut removes it; paste brings it back.
  await page.keyboard.press('ControlOrMeta+x')
  await expect(notes(page)).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+v')
  await expect(notes(page)).toHaveCount(1)
  await saved(page)
})

test('viewers see no save status or undo controls', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('dev.knoxId', 'm.park'))
  await openCanvas(page, OTHER)
  await expect(status(page)).toHaveCount(0)
  await expect(page.getByTestId('undo')).toHaveCount(0)
})
