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
