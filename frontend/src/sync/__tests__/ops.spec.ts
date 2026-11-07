import { describe, expect, it } from 'vitest'
import {
  applyOp,
  invert,
  invertTransaction,
  mergeTransactions,
  updateOp,
  type LocalOp,
} from '@/sync/ops'
import { makeComponent } from './fixtures'

describe('ops', () => {
  it('inverts create, delete and update', () => {
    const component = makeComponent('a')
    expect(invert({ kind: 'create', component })).toEqual({ kind: 'delete', component })
    expect(invert({ kind: 'delete', component })).toEqual({ kind: 'create', component })
    expect(invert({ kind: 'update', id: 'a', before: { x: 0 }, after: { x: 16 } })).toEqual({
      kind: 'update',
      id: 'a',
      before: { x: 16 },
      after: { x: 0 },
    })
  })

  it('applying a transaction then its inverse restores the original state', () => {
    const original = { a: makeComponent('a'), b: makeComponent('b', { x: 400 }) }
    const map = structuredClone(original)
    const tx: LocalOp[] = [
      updateOp(map.a, { x: 48, config: { markdown: 'hi', color: 'blue', fontSize: 'md' } })!,
      { kind: 'delete', component: structuredClone(map.b) },
      { kind: 'create', component: makeComponent('c') },
    ]
    for (const op of tx) applyOp(map, op)
    expect(Object.keys(map).sort()).toEqual(['a', 'c'])
    expect(map.a.x).toBe(48)

    for (const op of invertTransaction(tx)) applyOp(map, op)
    expect(map).toEqual(original)
  })

  it('updateOp records only changed fields and returns null for no-ops', () => {
    const component = makeComponent('a')
    expect(updateOp(component, { x: 0, title: 'a' })).toBeNull()
    expect(updateOp(component, { x: 16, y: 0 })).toEqual({
      kind: 'update',
      id: 'a',
      before: { x: 0 },
      after: { x: 16 },
    })
    // Deep comparison for config.
    expect(updateOp(component, { config: { ...component.config } })).toBeNull()
  })

  it('snapshots values so later mutation does not leak into history', () => {
    const component = makeComponent('a')
    const op = updateOp(component, { config: { markdown: 'x', color: 'red', fontSize: 'md' } })!
    component.config.markdown = 'mutated'
    expect(op.before.config).toEqual({ markdown: '', color: 'yellow', fontSize: 'md' })
  })

  it('merges consecutive updates of the same component', () => {
    const merged = mergeTransactions(
      [{ kind: 'update', id: 'a', before: { x: 0 }, after: { x: 16 } }],
      [
        { kind: 'update', id: 'a', before: { x: 16, y: 0 }, after: { x: 32, y: 16 } },
        { kind: 'update', id: 'b', before: { x: 0 }, after: { x: 16 } },
      ],
    )
    expect(merged).toEqual([
      { kind: 'update', id: 'a', before: { x: 0, y: 0 }, after: { x: 32, y: 16 } },
      { kind: 'update', id: 'b', before: { x: 0 }, after: { x: 16 } },
    ])
  })
})
