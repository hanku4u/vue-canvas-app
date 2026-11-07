import { test, expect, type Locator, type Page } from '@playwright/test'

// F3: registry, palette, inspector, activation, level of detail, Note component.
// "Weekly yield review" is empty; "ET-03 CD excursion" has 3 placeholders and a seeded note.

const EMPTY = 'c-yield-review'
const SEEDED = 'c-et03-excursion'

async function openCanvas(page: Page, id: string): Promise<void> {
  await page.goto(`/canvas/${id}`)
  await expect(page.getByTestId('canvas-view')).toBeVisible()
}

const nodes = (page: Page) => page.locator('.vue-flow__node')
const notes = (page: Page) => nodes(page).filter({ has: page.locator('[data-type=note]') })
const inspector = (page: Page) => page.getByTestId('inspector')

async function box(locator: Locator) {
  const value = await locator.boundingBox()
  if (!value) throw new Error('element not visible')
  return value
}

async function drag(page: Page, from: { x: number; y: number }, dx: number, dy: number) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 10 })
  await page.mouse.up()
}

async function asUser(page: Page, knoxId: string): Promise<void> {
  await page.addInitScript((id) => localStorage.setItem('dev.knoxId', id), knoxId)
}

test('palette click adds a note in the middle, selected, active and inspected', async ({
  page,
}) => {
  await openCanvas(page, EMPTY)
  await page.getByTestId('palette-note').click()

  const note = notes(page).first()
  await expect(note).toBeVisible()
  await expect(note).toHaveClass(/selected/)
  await expect(note.locator('.frame')).toHaveClass(/is-active/)
  await expect(inspector(page)).toContainText('Note')
  await expect(page.getByTestId('inspector-title').locator('input')).toHaveValue('Note')

  // Roughly centered in the canvas area.
  const canvas = await box(page.locator('.vue-flow__pane'))
  const b = await box(note)
  expect(Math.abs(b.x + b.width / 2 - (canvas.x + canvas.width / 2))).toBeLessThan(24)
  expect(Math.abs(b.y + b.height / 2 - (canvas.y + canvas.height / 2))).toBeLessThan(24)
})

test('dragging from the palette drops a note under the cursor', async ({ page }) => {
  await openCanvas(page, EMPTY)
  const pane = await box(page.locator('.vue-flow__pane'))
  await page.getByTestId('palette-note').dragTo(page.locator('.vue-flow__pane'), {
    targetPosition: { x: 300, y: 250 },
  })
  const note = notes(page).first()
  await expect(note).toBeVisible()
  const b = await box(note)
  expect(Math.abs(b.x + b.width / 2 - (pane.x + 300))).toBeLessThan(24)
  expect(Math.abs(b.y + b.height / 2 - (pane.y + 250))).toBeLessThan(24)
})

test('notes are edited inline as Markdown', async ({ page }) => {
  await openCanvas(page, EMPTY)
  await page.getByTestId('palette-note').click()
  const note = notes(page).first()
  await expect(note).toContainText('Double-click to write a note')

  await note.getByTestId('note').dblclick()
  const editor = page.getByTestId('note-editor')
  await expect(editor).toBeFocused()
  // Typing in the editor must not trigger canvas shortcuts (Delete, arrows, Ctrl+A).
  await editor.fill('# Findings\n\n- [x] CD high\n- [ ] wafer maps')
  await editor.press('Backspace')
  await editor.press('ControlOrMeta+a')
  await editor.fill('# Findings\n\n- [x] CD high\n- [ ] wafer maps')
  await editor.press('ControlOrMeta+Enter')

  await expect(note.locator('h1')).toHaveText('Findings')
  await expect(note.locator('input[type=checkbox]')).toHaveCount(2)
  await expect(nodes(page)).toHaveCount(1)

  // Escape also finishes editing and keeps the text.
  await note.getByTestId('note').dblclick()
  await page.getByTestId('note-editor').fill('Second draft')
  await page.getByTestId('note-editor').press('Escape')
  await expect(note).toContainText('Second draft')
})

test('inspector edits title, size and generated settings', async ({ page }) => {
  await openCanvas(page, EMPTY)
  await page.getByTestId('palette-note').click()
  const note = notes(page).first()

  const title = page.getByTestId('inspector-title').locator('input')
  await title.fill('Hypotheses')
  await title.press('Enter')
  await expect(note.locator('.frame__title')).toHaveText('Hypotheses')

  await inspector(page).getByRole('radio', { name: 'Green' }).click()
  await expect(note.getByTestId('note')).toHaveClass(/note--green/)
  await inspector(page).getByText('Large', { exact: true }).click()
  await expect(note.getByTestId('note')).toHaveClass(/note--lg/)

  const width = inspector(page).locator('label', { hasText: 'W' }).locator('input')
  await width.fill('480')
  await width.press('Enter')
  await expect.poll(async () => Math.round((await box(note)).width)).toBe(480)
})

test('active components take the drag; the header still moves them', async ({ page }) => {
  await openCanvas(page, EMPTY)
  await page.getByTestId('palette-note').click()
  const note = notes(page).first()
  const frame = note.locator('.frame')
  await expect(frame).toHaveClass(/is-active/)

  // Dragging the body of an active component does not move it.
  let before = await box(note)
  await drag(page, { x: before.x + 100, y: before.y + 100 }, 120, 60)
  expect(await box(note)).toEqual(before)

  // Dragging the header does.
  await drag(page, { x: before.x + 60, y: before.y + 14 }, 128, 64)
  // Moves with the mouse (within one 16px grid step: snapping, and Vue Flow drops the
  // first few pixels of a drag).
  const after = await box(note)
  expect(Math.abs(after.x - before.x - 128)).toBeLessThanOrEqual(16)

  // Esc deactivates (selection stays); a second Esc clears the selection.
  await page.keyboard.press('Escape')
  await expect(frame).not.toHaveClass(/is-active/)
  await expect(note).toHaveClass(/selected/)
  await page.keyboard.press('Escape')
  await expect(note).not.toHaveClass(/selected/)

  // Inactive: dragging the body moves it.
  before = await box(note)
  await drag(page, { x: before.x + 100, y: before.y + 100 }, 64, 32)
  expect(Math.abs((await box(note)).x - before.x - 64)).toBeLessThanOrEqual(16)
})

test('duplicate with Ctrl/⌘+D and multi-selection summary', async ({ page }) => {
  await openCanvas(page, EMPTY)
  await page.getByTestId('palette-note').click()
  await page.keyboard.press('Escape')
  await page.keyboard.press('ControlOrMeta+d')
  await expect(notes(page)).toHaveCount(2)
  await page.keyboard.press('ControlOrMeta+a')
  await expect(page.getByTestId('inspector-multi')).toHaveText('2 components selected')
})

test('zooming out switches components to their previews', async ({ page }) => {
  await openCanvas(page, SEEDED)
  const level = page.getByTestId('zoom-level')
  await expect(page.locator('[data-lod=full]')).toHaveCount(4)

  for (const expected of ['83%', '69%', '58%', '48%']) {
    await page.keyboard.press('-')
    await expect(level).toHaveText(expected)
  }
  await expect(page.locator('[data-lod=preview]')).toHaveCount(4)
  // Placeholders have a preview; notes keep their full view (cheap to render).
  await expect(page.getByTestId('placeholder-preview')).toHaveCount(3)
  await expect(notes(page).locator('.note__content')).toBeVisible()

  await page.keyboard.press('ControlOrMeta+0')
  await expect(page.getByTestId('placeholder-preview')).toHaveCount(0)
})

test('viewers get no palette and a read-only inspector', async ({ page }) => {
  await asUser(page, 'm.park')
  await openCanvas(page, SEEDED)
  await expect(page.getByTestId('palette')).toHaveCount(0)

  const note = notes(page).first()
  await expect(note).toContainText('Hypothesis')
  await note.getByTestId('note').dblclick()
  await expect(page.getByTestId('note-editor')).toHaveCount(0)

  await note.locator('.frame__header').click()
  await expect(page.getByTestId('inspector-title').locator('input')).toBeDisabled()
  await expect(inspector(page)).toContainText('view only')
  await expect(inspector(page).getByRole('radio', { name: 'Green' })).toBeDisabled()
})

test('side panels collapse and stay collapsed', async ({ page }) => {
  await openCanvas(page, EMPTY)
  await page.getByTestId('panel-left-toggle').click()
  await expect(page.getByTestId('palette')).toBeHidden()
  await page.getByTestId('panel-right-toggle').click()
  await expect(inspector(page)).toBeHidden()
  await page.reload()
  await expect(page.getByTestId('canvas-view')).toBeVisible()
  await expect(page.getByTestId('palette')).toBeHidden()
  await expect(inspector(page)).toBeHidden()
})
