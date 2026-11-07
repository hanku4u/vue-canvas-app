import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { setupServer } from 'msw/node'
import {
  applyOps,
  createCanvas,
  deleteCanvas,
  duplicateCanvas,
  getCanvas,
  listCanvases,
} from '@/api/canvases'
import { ApiError } from '@/api/client'
import { setDevKnoxId } from '@/api/devIdentity'
import { handlers } from '@/mocks/handlers'
import { getDb, newId, resetDb, saveDb } from '@/mocks/db'

const server = setupServer(...handlers)

const EMPTY = 'c-yield-review'
const SEEDED = 'c-et03-excursion'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  localStorage.clear()
  resetDb()
})
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function as(knoxId: string): void {
  setDevKnoxId(knoxId)
}

async function apiErrorOf(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(ApiError)
  return error as ApiError
}

describe('canvas lists', () => {
  it('separates owned and shared canvases', async () => {
    as('j.doe')
    const mine = await listCanvases({ scope: 'mine' })
    const shared = await listCanvases({ scope: 'shared' })
    expect(mine.items.map((c) => c.id)).toEqual(['c-et03-excursion', 'c-yield-review'])
    expect(mine.items.every((c) => c.role === 'owner')).toBe(true)
    expect(shared.items).toHaveLength(1)
    // j.doe holds a viewer share here, but as an admin their effective role is 'admin'.
    expect(shared.items[0]).toMatchObject({
      id: 'c-litho-weekly',
      role: 'admin',
      owner: { knoxId: 'k.lee', displayName: 'Kim Lee' },
    })
  })

  it('searches title and description', async () => {
    as('k.lee')
    const result = await listCanvases({ scope: 'shared', search: 'thickness' })
    expect(result.items.map((c) => c.id)).toEqual(['c-cmp-monitor'])
  })

  it('restricts scope=all to admins', async () => {
    as('j.doe')
    expect((await listCanvases({ scope: 'all' })).items).toHaveLength(4)
    as('k.lee')
    expect((await apiErrorOf(listCanvases({ scope: 'all' }))).code).toBe('ADMIN_REQUIRED')
  })
})

describe('canvas lifecycle', () => {
  it('creates, renames with version checks, and deletes', async () => {
    as('s.choi')
    const created = await createCanvas({ title: '  New investigation ', description: 'notes' })
    expect(created).toMatchObject({ title: 'New investigation', role: 'owner', version: 1 })

    const result = await applyOps(created.id, [
      { op: 'canvas.update', version: 1, set: { title: 'Renamed' } },
    ])
    expect(result.versions.canvas).toBe(2)
    expect((await getCanvas(created.id)).title).toBe('Renamed')

    const stale = await apiErrorOf(
      applyOps(created.id, [{ op: 'canvas.update', version: 1, set: { title: 'Stale' } }]),
    )
    expect(stale).toMatchObject({ status: 409, code: 'VERSION_CONFLICT' })

    await deleteCanvas(created.id)
    expect((await apiErrorOf(getCanvas(created.id))).status).toBe(404)
    expect((await listCanvases({ scope: 'mine' })).items).toHaveLength(0)
  })

  it('validates titles', async () => {
    as('j.doe')
    expect((await apiErrorOf(createCanvas({ title: '   ' }))).code).toBe('INVALID_PARAMS')
    expect((await apiErrorOf(createCanvas({ title: 'x'.repeat(121) }))).code).toBe('INVALID_PARAMS')
  })
})

describe('canvas permissions', () => {
  it('hides canvases without a share behind 404', async () => {
    as('s.choi')
    expect((await apiErrorOf(getCanvas('c-et03-excursion'))).status).toBe(404)
  })

  it('lets editors rename but not delete', async () => {
    as('k.lee')
    const canvas = await getCanvas('c-et03-excursion')
    expect(canvas.role).toBe('editor')
    expect(canvas.canManageAccess).toBe(false)
    await applyOps(canvas.id, [
      { op: 'canvas.update', version: canvas.version, set: { title: 'x' } },
    ])
    expect((await apiErrorOf(deleteCanvas(canvas.id))).status).toBe(403)
  })

  it('stops viewers from editing', async () => {
    as('m.park')
    const canvas = await getCanvas('c-et03-excursion')
    expect(canvas.role).toBe('viewer')
    const error = await apiErrorOf(
      applyOps(canvas.id, [{ op: 'canvas.update', version: canvas.version, set: { title: 'x' } }]),
    )
    expect(error).toMatchObject({ status: 403, details: { deniedOps: [0] } })
  })

  it('gives admins access to canvases they were not shared on', async () => {
    as('j.doe')
    const canvas = await getCanvas('c-cmp-monitor')
    expect(canvas).toMatchObject({ role: 'admin', canManageAccess: true })
  })
})

describe('duplicate', () => {
  it('copies only visible components, without restrictions, owned by the caller', async () => {
    const db = getDb()
    db.components = {}
    db.acl = []
    const base = {
      canvasId: 'c-et03-excursion',
      groupId: null,
      type: 'note',
      x: 0,
      y: 0,
      w: 200,
      h: 120,
      zIndex: 0,
      config: {},
      configVersion: 1,
      version: 1,
      createdBy: 'j.doe',
      updatedBy: 'j.doe',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const open = newId()
    const hidden = newId()
    const locked = newId()
    db.components[open] = {
      ...base,
      id: open,
      title: 'open',
      viewRestricted: false,
      editRestricted: false,
    }
    db.components[hidden] = {
      ...base,
      id: hidden,
      title: 'hidden',
      viewRestricted: true,
      editRestricted: false,
    }
    db.components[locked] = {
      ...base,
      id: locked,
      title: 'locked',
      viewRestricted: false,
      editRestricted: true,
    }
    saveDb()

    as('m.park')
    const original = await getCanvas('c-et03-excursion')
    expect(original.components.map((c) => c.title).sort()).toEqual(['locked', 'open'])

    const copy = await duplicateCanvas('c-et03-excursion', 'My copy')
    expect(copy).toMatchObject({ title: 'My copy', role: 'owner', owner: { knoxId: 'm.park' } })
    expect(copy.components.map((c) => c.title).sort()).toEqual(['locked', 'open'])
    expect(copy.components.every((c) => !c.access.editRestricted && c.access.canEdit)).toBe(true)
  })
})

describe('component ops', () => {
  const newNote = (id: string) => ({
    id,
    type: 'note',
    title: 'Note',
    groupId: null,
    x: 0,
    y: 0,
    w: 288,
    h: 192,
    zIndex: 9,
    config: { markdown: 'hi' },
    configVersion: 1,
  })

  it('creates, updates and deletes with versions', async () => {
    as('j.doe')
    const created = await applyOps(EMPTY, [{ op: 'component.create', component: newNote('n1') }])
    expect(created.versions).toEqual({ n1: 1 })

    const moved = await applyOps(EMPTY, [
      { op: 'component.update', id: 'n1', version: 1, set: { x: 64, title: 'Moved' } },
    ])
    expect(moved.versions).toEqual({ n1: 2 })
    expect((await getCanvas(EMPTY)).components[0]).toMatchObject({
      id: 'n1',
      x: 64,
      title: 'Moved',
      version: 2,
      updatedBy: 'j.doe',
    })

    await applyOps(EMPTY, [{ op: 'component.delete', id: 'n1', version: 2 }])
    expect((await getCanvas(EMPTY)).components).toEqual([])
    // Re-creating a deleted id is allowed (undo of a delete).
    await applyOps(EMPTY, [{ op: 'component.create', component: newNote('n1') }])
  })

  it('reports stale versions and missing components as conflicts', async () => {
    as('j.doe')
    await applyOps(EMPTY, [{ op: 'component.create', component: newNote('n1') }])
    await applyOps(EMPTY, [{ op: 'component.update', id: 'n1', version: 1, set: { x: 16 } }])

    const stale = await apiErrorOf(
      applyOps(EMPTY, [{ op: 'component.update', id: 'n1', version: 1, set: { x: 32 } }]),
    )
    expect(stale).toMatchObject({ status: 409, code: 'VERSION_CONFLICT' })
    expect(stale.details).toMatchObject({
      conflicts: [{ opIndex: 0, id: 'n1', current: { id: 'n1', x: 16, version: 2 } }],
    })

    const gone = await apiErrorOf(
      applyOps(EMPTY, [{ op: 'component.delete', id: 'nope', version: 1 }]),
    )
    expect(gone.details).toMatchObject({ conflicts: [{ id: 'nope', current: null }] })
  })

  it('applies batches atomically', async () => {
    as('j.doe')
    const error = await apiErrorOf(
      applyOps(EMPTY, [
        { op: 'component.create', component: newNote('n1') },
        { op: 'component.update', id: 'missing', version: 1, set: { x: 1 } },
      ]),
    )
    expect(error.status).toBe(409)
    expect((await getCanvas(EMPTY)).components).toEqual([])
  })

  it('enforces component permissions per op', async () => {
    // k.lee is an editor on the seeded canvas; component p3 is edit-restricted.
    as('k.lee')
    const canvas = await getCanvas(SEEDED)
    const locked = canvas.components.find((c) => c.id === 'c-et03-excursion-p3')!
    const open = canvas.components.find((c) => c.id === 'c-et03-excursion-p2')!
    expect(locked.access.canEdit).toBe(false)

    const denied = await apiErrorOf(
      applyOps(SEEDED, [
        { op: 'component.update', id: open.id, version: open.version, set: { x: 1 } },
        { op: 'component.update', id: locked.id, version: locked.version, set: { x: 1 } },
      ]),
    )
    expect(denied).toMatchObject({ status: 403, details: { deniedOps: [1] } })

    as('m.park')
    const viewer = await apiErrorOf(
      applyOps(SEEDED, [{ op: 'component.create', component: newNote('v1') }]),
    )
    expect(viewer.status).toBe(403)
  })

  it('validates fields', async () => {
    as('j.doe')
    await applyOps(EMPTY, [{ op: 'component.create', component: newNote('n1') }])
    const bad = await apiErrorOf(
      applyOps(EMPTY, [{ op: 'component.update', id: 'n1', version: 1, set: { w: -5 } as never }]),
    )
    expect(bad).toMatchObject({ status: 400, code: 'INVALID_OP' })
  })

  it('can simulate failures for testing', async () => {
    as('j.doe')
    localStorage.setItem('mock.failOps', '503')
    const error = await apiErrorOf(
      applyOps(EMPTY, [{ op: 'component.create', component: newNote('n1') }]),
    )
    expect(error.status).toBe(503)
    localStorage.removeItem('mock.failOps')
  })
})

describe('group ops', () => {
  const group = (id: string) => ({ id, title: 'Etch', x: 100, y: 100, w: 400, h: 300, zIndex: 0 })
  const note = (id: string, groupId: string | null, x = 10, y = 50) => ({
    id,
    type: 'note',
    title: 'Note',
    groupId,
    x,
    y,
    w: 100,
    h: 100,
    zIndex: 1,
    config: {},
    configVersion: 1,
  })

  it('creates a group and a component inside it in one batch', async () => {
    as('j.doe')
    const result = await applyOps(EMPTY, [
      { op: 'group.create', group: group('g1') },
      { op: 'component.create', component: note('n1', 'g1') },
    ])
    expect(result.versions).toEqual({ g1: 1, n1: 1 })
    const canvas = await getCanvas(EMPTY)
    expect(canvas.groups).toEqual([
      expect.objectContaining({ id: 'g1', title: 'Etch', version: 1 }),
    ])
    expect(canvas.components[0]?.groupId).toBe('g1')
  })

  it('rejects unknown groups and rolls back the whole batch', async () => {
    as('j.doe')
    const error = await apiErrorOf(
      applyOps(EMPTY, [
        { op: 'group.create', group: group('g1') },
        { op: 'component.create', component: note('n1', 'nope') },
      ]),
    )
    expect(error.code).toBe('INVALID_OP')
    expect((await getCanvas(EMPTY)).groups).toEqual([])
  })

  it('ungroup detaches remaining children to absolute positions', async () => {
    as('j.doe')
    await applyOps(EMPTY, [
      { op: 'group.create', group: group('g1') },
      { op: 'component.create', component: note('n1', 'g1', 10, 50) },
    ])
    await applyOps(EMPTY, [{ op: 'group.delete', id: 'g1', version: 1, mode: 'ungroup' }])
    const canvas = await getCanvas(EMPTY)
    expect(canvas.groups).toEqual([])
    expect(canvas.components[0]).toMatchObject({ groupId: null, x: 110, y: 150, version: 2 })
  })

  it('refuses to delete contents the caller cannot edit', async () => {
    as('j.doe')
    await applyOps(SEEDED, [
      { op: 'group.create', group: group('g1') },
      {
        op: 'component.update',
        id: 'c-et03-excursion-p3',
        version: 1,
        set: { groupId: 'g1' },
      },
    ])
    // k.lee (editor) can't edit p3 (edit-restricted).
    as('k.lee')
    const error = await apiErrorOf(
      applyOps(SEEDED, [{ op: 'group.delete', id: 'g1', version: 1, mode: 'withContents' }]),
    )
    expect(error).toMatchObject({ status: 403, code: 'CONTAINS_UNEDITABLE' })
    // Ungrouping is fine.
    await applyOps(SEEDED, [{ op: 'group.delete', id: 'g1', version: 1, mode: 'ungroup' }])
  })

  it('versions group updates', async () => {
    as('j.doe')
    await applyOps(EMPTY, [{ op: 'group.create', group: group('g1') }])
    await applyOps(EMPTY, [{ op: 'group.update', id: 'g1', version: 1, set: { collapsed: true } }])
    const stale = await apiErrorOf(
      applyOps(EMPTY, [{ op: 'group.update', id: 'g1', version: 1, set: { title: 'x' } }]),
    )
    expect(stale.details).toMatchObject({
      conflicts: [{ id: 'g1', current: { id: 'g1', collapsed: true, version: 2 } }],
    })
  })
})
