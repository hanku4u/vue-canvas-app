import { describe, expect, it } from 'vitest'
import { UndoHistory } from '@/sync/history'
import type { Transaction } from '@/sync/ops'

const move = (id: string, from: number, to: number): Transaction => [
  { kind: 'update', id, before: { x: from }, after: { x: to } },
]

describe('UndoHistory', () => {
  it('undoes and redoes in order', () => {
    const history = new UndoHistory()
    history.push(move('a', 0, 16))
    history.push(move('a', 16, 32))
    expect(history.undo()).toEqual(move('a', 32, 16))
    expect(history.undo()).toEqual(move('a', 16, 0))
    expect(history.undo()).toBeNull()
    expect(history.redo()).toEqual(move('a', 0, 16))
    expect(history.canUndo).toBe(true)
    expect(history.canRedo).toBe(true)
  })

  it('clears redo on a new edit', () => {
    const history = new UndoHistory()
    history.push(move('a', 0, 16))
    history.undo()
    history.push(move('b', 0, 16))
    expect(history.canRedo).toBe(false)
  })

  it('merges same-key pushes within a second into one step', () => {
    let now = 1000
    const history = new UndoHistory(() => now)
    history.push(move('a', 0, 16), 'nudge:a')
    now += 300
    history.push(move('a', 16, 32), 'nudge:a')
    now += 300
    history.push(move('a', 32, 48), 'nudge:a')
    now += 2000
    history.push(move('a', 48, 64), 'nudge:a') // too late: new step

    expect(history.undo()).toEqual(move('a', 64, 48))
    expect(history.undo()).toEqual(move('a', 48, 0))
    expect(history.canUndo).toBe(false)
  })

  it('does not merge different keys or keyless pushes', () => {
    const history = new UndoHistory(() => 0)
    history.push(move('a', 0, 16), 'nudge:a')
    history.push(move('b', 0, 16), 'nudge:b')
    history.push(move('b', 16, 32))
    history.undo()
    history.undo()
    expect(history.canUndo).toBe(true)
  })

  it('ignores empty transactions', () => {
    const history = new UndoHistory()
    history.push([])
    expect(history.canUndo).toBe(false)
  })
})
