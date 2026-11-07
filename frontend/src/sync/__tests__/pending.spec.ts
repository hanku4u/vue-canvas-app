import { describe, expect, it } from 'vitest'
import { buildOps, PendingChanges } from '@/sync/pending'
import { COMPONENT_FIELDS } from '@/sync/ops'
import { makeComponent } from './fixtures'

const update = (id: string, after: Record<string, unknown>) =>
  ({ kind: 'update', id, before: {}, after }) as const

describe('PendingChanges', () => {
  it('coalesces many updates of one component into one update op', () => {
    const pending = new PendingChanges()
    pending.record(update('a', { x: 16 }))
    pending.record(update('a', { x: 32 }))
    pending.record(update('a', { title: 'T' }))
    const components = { a: makeComponent('a', { x: 32, title: 'T', version: 4 }) }
    expect(buildOps(pending.take(), components)).toEqual([
      { op: 'component.update', id: 'a', version: 4, set: { x: 32, title: 'T' } },
    ])
    expect(pending.isEmpty).toBe(true)
  })

  it('sends a create with the latest state, absorbing later updates', () => {
    const pending = new PendingChanges()
    const component = makeComponent('n', { version: 0 })
    pending.record({ kind: 'create', component })
    pending.record(update('n', { x: 64 }))
    const ops = buildOps(pending.take(), { n: { ...component, x: 64 } })
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ op: 'component.create', component: { id: 'n', x: 64 } })
  })

  it('cancels a create followed by a delete', () => {
    const pending = new PendingChanges()
    const component = makeComponent('n', { version: 0 })
    pending.record({ kind: 'create', component })
    pending.record({ kind: 'delete', component })
    expect(pending.isEmpty).toBe(true)
  })

  it('turns update + delete into a delete at the server version', () => {
    const pending = new PendingChanges()
    pending.record(update('a', { x: 16 }))
    pending.record({ kind: 'delete', component: makeComponent('a', { version: 3 }) })
    expect(buildOps(pending.take(), {})).toEqual([{ op: 'component.delete', id: 'a', version: 3 }])
  })

  it('turns delete + re-create (undo) into a full update', () => {
    const pending = new PendingChanges()
    const component = makeComponent('a', { version: 3 })
    pending.record({ kind: 'delete', component })
    pending.record({ kind: 'create', component })
    const ops = buildOps(pending.take(), { a: component })
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ op: 'component.update', id: 'a', version: 3 })
    expect(Object.keys((ops[0] as { set: object }).set).sort()).toEqual(
      [...COMPONENT_FIELDS].sort(),
    )
  })

  it('restores a failed batch under newer edits', () => {
    const pending = new PendingChanges()
    pending.record(update('a', { x: 16 }))
    pending.record({ kind: 'create', component: makeComponent('n', { version: 0 }) })
    const failed = pending.take()

    // While the batch was in flight: more edits.
    pending.record(update('a', { y: 32 }))
    pending.record(update('n', { title: 'later' }))
    pending.restore(failed)

    const components = {
      a: makeComponent('a', { x: 16, y: 32, version: 2 }),
      n: makeComponent('n', { title: 'later', version: 0 }),
    }
    const ops = buildOps(pending.take(), components)
    expect(ops).toEqual([
      expect.objectContaining({
        op: 'component.create',
        component: expect.objectContaining({ id: 'n', title: 'later' }),
      }),
      { op: 'component.update', id: 'a', version: 2, set: { y: 32, x: 16 } },
    ])
  })

  it('restoring a failed create that was deleted meanwhile cancels both', () => {
    const pending = new PendingChanges()
    const component = makeComponent('n', { version: 0 })
    pending.record({ kind: 'create', component })
    const failed = pending.take()
    pending.record({ kind: 'delete', component })
    pending.restore(failed)
    expect(pending.isEmpty).toBe(true)
  })

  it('supports conflict resolution helpers', () => {
    const pending = new PendingChanges()
    pending.record(update('a', { x: 16 }))
    pending.forget('a')
    expect(pending.has('a')).toBe(false)

    pending.record(update('b', { x: 16 }))
    pending.markCreate('b')
    expect(buildOps(pending.take(), { b: makeComponent('b') })[0]?.op).toBe('component.create')

    pending.record({ kind: 'delete', component: makeComponent('c', { version: 1 }) })
    pending.retargetDelete('c', 5)
    expect(buildOps(pending.take(), {})).toEqual([{ op: 'component.delete', id: 'c', version: 5 }])
  })
})
