import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Canvas, CanvasComponent, CanvasRole } from '@/api/types'
import { registerBuiltInComponents } from '@/components'
import { useCanvasDocStore } from '@/stores/canvasDoc'

function component(id: string, zIndex: number, canEdit = true): CanvasComponent {
  return {
    id,
    type: 'placeholder',
    title: id,
    groupId: null,
    x: 0,
    y: 0,
    w: 320,
    h: 208,
    zIndex,
    config: {},
    configVersion: 1,
    version: 1,
    access: { canEdit, viewRestricted: false, editRestricted: !canEdit },
    updatedBy: 'j.doe',
    updatedAt: '2026-11-07T00:00:00Z',
  }
}

function canvas(role: CanvasRole, components: CanvasComponent[]): Canvas {
  return {
    id: 'c1',
    title: 'Test',
    description: '',
    owner: { knoxId: 'j.doe', displayName: 'Jane Doe' },
    role,
    canManageAccess: role === 'owner',
    version: 1,
    revision: 1,
    defaultFilters: {},
    groups: [],
    components,
    updatedAt: '2026-11-07T00:00:00Z',
  }
}

describe('canvasDoc store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('loads components and orders them by zIndex', () => {
    const store = useCanvasDocStore()
    store.load(canvas('owner', [component('b', 2), component('a', 0), component('c', 1)]))
    expect(store.ordered.map((c) => c.id)).toEqual(['a', 'c', 'b'])
    expect(store.dirty).toBe(false)
  })

  it('adds components on top and marks the document dirty', () => {
    const store = useCanvasDocStore()
    store.load(canvas('editor', [component('a', 5)]))
    const added = store.addComponent({
      type: 'placeholder',
      title: 'New',
      x: 16,
      y: 32,
      w: 320,
      h: 208,
    })
    expect(added?.zIndex).toBe(6)
    expect(store.ordered[store.ordered.length - 1]?.id).toBe(added?.id)
    expect(store.dirty).toBe(true)
  })

  it('updates geometry only for editable components', () => {
    const store = useCanvasDocStore()
    store.load(canvas('editor', [component('open', 0), component('locked', 1, false)]))
    store.updateGeometry([
      { id: 'open', x: 48, w: 400 },
      { id: 'locked', x: 48 },
    ])
    expect(store.components.open).toMatchObject({ x: 48, w: 400 })
    expect(store.components.locked?.x).toBe(0)
  })

  it('does not count no-op geometry updates as changes', () => {
    const store = useCanvasDocStore()
    store.load(canvas('owner', [component('a', 0)]))
    const revision = store.revision
    store.updateGeometry([{ id: 'a', x: 0, y: 0 }])
    expect(store.revision).toBe(revision)
    expect(store.dirty).toBe(false)
  })

  it('nudges and removes only editable components', () => {
    const store = useCanvasDocStore()
    store.load(canvas('editor', [component('open', 0), component('locked', 1, false)]))
    store.nudge(['open', 'locked'], 16, -16)
    expect(store.components.open).toMatchObject({ x: 16, y: -16 })
    expect(store.components.locked).toMatchObject({ x: 0, y: 0 })
    expect(store.removeComponents(['open', 'locked'])).toEqual(['open'])
    expect(Object.keys(store.components)).toEqual(['locked'])
  })

  it('restacks to front and back, keeping relative order', () => {
    const store = useCanvasDocStore()
    store.load(
      canvas('owner', [component('a', 0), component('b', 1), component('c', 2), component('d', 3)]),
    )
    store.bringToFront(['b', 'a'])
    expect(store.ordered.map((c) => c.id)).toEqual(['c', 'd', 'a', 'b'])
    store.sendToBack(['d'])
    expect(store.ordered.map((c) => c.id)).toEqual(['d', 'c', 'a', 'b'])
  })

  it('refuses edits for viewers', () => {
    const store = useCanvasDocStore()
    store.load(canvas('viewer', [component('a', 0)]))
    expect(store.canEdit).toBe(false)
    expect(
      store.addComponent({ type: 'placeholder', title: 'x', x: 0, y: 0, w: 1, h: 1 }),
    ).toBeNull()
    store.updateGeometry([{ id: 'a', x: 100 }])
    expect(store.removeComponents(['a'])).toEqual([])
    expect(store.components.a?.x).toBe(0)
    expect(store.dirty).toBe(false)
  })
})

describe('canvasDoc store: titles, config and duplication', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    registerBuiltInComponents()
  })

  function note(id: string, canEdit = true): CanvasComponent {
    return {
      ...component(id, 0, canEdit),
      type: 'note',
      config: { markdown: 'hi', color: 'yellow', fontSize: 'md' },
    }
  }

  it('renames, trimming and rejecting empty titles', () => {
    const store = useCanvasDocStore()
    store.load(canvas('owner', [note('n')]))
    expect(store.renameComponent('n', '  Findings  ')).toBe(true)
    expect(store.components.n?.title).toBe('Findings')
    expect(store.renameComponent('n', '   ')).toBe(false)
    expect(store.components.n?.title).toBe('Findings')
  })

  it('validates config patches against the type schema', () => {
    const store = useCanvasDocStore()
    store.load(canvas('owner', [note('n')]))
    expect(store.updateConfig('n', { color: 'blue' })).toBeNull()
    expect(store.components.n?.config).toEqual({ markdown: 'hi', color: 'blue', fontSize: 'md' })
    expect(store.updateConfig('n', { color: 'purple' })).toMatch(/color/)
    expect(store.components.n?.config.color).toBe('blue')
  })

  it('resets an invalid config to defaults', () => {
    const store = useCanvasDocStore()
    store.load(canvas('owner', [{ ...note('n'), config: { color: 42 } }]))
    expect(store.updateConfig('n', { fontSize: 'lg' })).toBeNull()
    expect(store.components.n?.config).toEqual({ markdown: '', color: 'yellow', fontSize: 'lg' })
  })

  it('refuses config changes it is not allowed to make', () => {
    const store = useCanvasDocStore()
    store.load(canvas('owner', [{ ...note('n'), type: 'mystery' }]))
    expect(store.updateConfig('n', {})).toMatch(/Unknown component type/)
    store.load(canvas('editor', [note('locked', false)]))
    expect(store.updateConfig('locked', { color: 'red' })).toMatch(/cannot edit/)
  })

  it('duplicates with an offset, a deep config copy and on top', () => {
    const store = useCanvasDocStore()
    store.load(canvas('editor', [note('n'), note('locked', false)]))
    const [copy, lockedCopy] = store.duplicateComponents(['n', 'locked'])
    expect(store.components[copy!]).toMatchObject({ type: 'note', x: 32, y: 32, title: 'n' })
    expect(store.components[copy!]?.config).not.toBe(store.components.n?.config)
    // Locked components can still be copied (like copy/paste); the copy is editable.
    expect(store.components[lockedCopy!]?.access.canEdit).toBe(true)
    expect(store.ordered.slice(-2).map((c) => c.id)).toEqual([copy, lockedCopy])
  })
})

describe('canvasDoc store: undo, redo and remote merge', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    registerBuiltInComponents()
  })

  function setup(role: CanvasRole = 'owner') {
    const store = useCanvasDocStore()
    // Never actually send: these tests are about local state.
    store.configure({ syncDebounceMs: 60_000, syncSend: () => new Promise(() => undefined) })
    store.load(canvas(role, [component('a', 0), component('b', 1)]))
    return store
  }

  it('undoes and redoes moves, adds, deletes and config changes', () => {
    const store = setup()
    store.updateGeometry([{ id: 'a', x: 96 }])
    const added = store.addComponent({ type: 'note', title: 'N', x: 0, y: 0, w: 288, h: 192 })!
    store.removeComponents(['b'])
    store.renameComponent('a', 'Renamed')

    expect(store.undo()).toBe(true) // rename
    expect(store.components.a?.title).toBe('a')
    store.undo() // delete b
    expect(store.components.b).toBeDefined()
    store.undo() // add
    expect(store.components[added.id]).toBeUndefined()
    store.undo() // move
    expect(store.components.a?.x).toBe(0)
    expect(store.canUndo).toBe(false)

    store.redo()
    store.redo()
    expect(store.components.a?.x).toBe(96)
    expect(store.components[added.id]?.title).toBe('N')
    expect(store.canRedo).toBe(true)
  })

  it('treats a multi-component drag as one undo step', () => {
    const store = setup()
    store.updateGeometry([
      { id: 'a', x: 16, y: 16 },
      { id: 'b', x: 32, y: 32 },
    ])
    store.undo()
    expect([store.components.a?.x, store.components.b?.x]).toEqual([0, 0])
  })

  it('merges consecutive nudges into one undo step', () => {
    const store = setup()
    store.nudge(['a'], 16, 0)
    store.nudge(['a'], 16, 0)
    store.nudge(['a'], 16, 0)
    expect(store.components.a?.x).toBe(48)
    store.undo()
    expect(store.components.a?.x).toBe(0)
    expect(store.canUndo).toBe(false)
  })

  it('marks the document dirty until saved', () => {
    const store = setup()
    expect(store.saveStatus).toBe('saved')
    store.nudge(['a'], 16, 0)
    expect(store.saveStatus).toBe('pending')
    expect(store.dirty).toBe(true)
  })

  it('viewers cannot undo', () => {
    const store = setup('viewer')
    expect(store.undo()).toBe(false)
  })

  it('merges remote changes except for components with unsaved edits', () => {
    const store = setup()
    store.updateGeometry([{ id: 'a', x: 500 }]) // pending local edit
    const remote = canvas('owner', [
      { ...component('a', 0), x: 7, version: 5 },
      { ...component('b', 1), x: 99, version: 3 },
      { ...component('c', 2), version: 1 },
    ])
    store.mergeRemote(remote)
    expect(store.components.a?.x).toBe(500) // ours wins while pending
    expect(store.components.b).toMatchObject({ x: 99, version: 3 })
    expect(store.components.c).toBeDefined()

    // Removed on the server and not edited here → removed locally.
    store.mergeRemote(canvas('owner', [{ ...component('a', 0), version: 5 }]))
    expect(store.components.b).toBeUndefined()
  })

  it('resolves conflicts by keeping theirs or reapplying mine', () => {
    const store = setup()
    store.updateGeometry([{ id: 'a', x: 500 }])
    store.conflicts = [{ opIndex: 0, id: 'a', current: { ...component('a', 0), x: 7, version: 4 } }]
    store.resolveConflicts('mine')
    expect(store.components.a).toMatchObject({ x: 500, version: 4 })

    store.updateGeometry([{ id: 'b', x: 300 }])
    store.conflicts = [{ opIndex: 0, id: 'b', current: null }]
    store.resolveConflicts('theirs')
    expect(store.components.b).toBeUndefined()
  })
})

describe('canvasDoc store: groups', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    registerBuiltInComponents()
  })

  function setup(components: CanvasComponent[]) {
    const store = useCanvasDocStore()
    store.configure({ syncDebounceMs: 60_000, syncSend: () => new Promise(() => undefined) })
    store.load(canvas('editor', components))
    return store
  }

  const at = (id: string, x: number, y: number, canEdit = true) => ({
    ...component(id, 0, canEdit),
    x,
    y,
    w: 100,
    h: 100,
  })

  it('wraps the selection in a snapped frame with children positioned relative to it', () => {
    const store = setup([at('a', 100, 100), at('b', 300, 200)])
    const result = store.groupComponents(['a', 'b'], 'Etch')
    const id = 'id' in result ? result.id : ''
    const group = store.groups[id]!
    expect(group).toMatchObject({ title: 'Etch', x: 64, y: 32 })
    expect(group.w % 16).toBe(0)
    expect(group.x + group.w).toBeGreaterThanOrEqual(300 + 100 + 24)
    expect(store.components.a).toMatchObject({ groupId: id, x: 36, y: 68 })
    expect(store.absolute(store.components.b!)).toEqual({ x: 300, y: 200 })

    store.undo()
    expect(store.groups).toEqual({})
    expect(store.components.a).toMatchObject({ groupId: null, x: 100, y: 100 })
  })

  it('refuses to group locked components', () => {
    const store = setup([at('a', 0, 0), at('locked', 200, 0, false)])
    expect(store.groupComponents(['a', 'locked'])).toEqual({
      error: 'Some selected components are locked for you',
    })
  })

  it('ungroups keeping absolute positions, and undo restores the group', () => {
    const store = setup([at('a', 100, 100)])
    const { id } = store.groupComponents(['a']) as { id: string }
    store.finishDrag([{ id, x: 400, y: 400 }]) // move the group
    const before = store.absolute(store.components.a!)
    store.ungroup([id])
    expect(store.groups[id]).toBeUndefined()
    expect(store.components.a).toMatchObject({ groupId: null, ...before })
    store.undo()
    expect(store.components.a?.groupId).toBe(id)
    expect(store.absolute(store.components.a!)).toEqual(before)
  })

  it('changes membership when a component is dropped on or off a frame', () => {
    const store = setup([at('a', 0, 0), at('b', 600, 600)])
    const { id } = store.groupComponents(['a']) as { id: string }
    const group = store.groups[id]!
    // Drop b in the middle of the frame (absolute coordinates).
    store.finishDrag([{ id: 'b', x: group.x + 30, y: group.y + 50 }])
    expect(store.components.b).toMatchObject({ groupId: id, x: 30, y: 50 })
    // Drag a far away: it leaves the group.
    store.finishDrag([{ id: 'a', x: 2000, y: 2000 }])
    expect(store.components.a).toMatchObject({ groupId: null, x: 2000, y: 2000 })
    // Collapsed groups don't take drops.
    store.setGroupCollapsed(id, true)
    store.finishDrag([{ id: 'a', x: group.x + 30, y: group.y + 50 }])
    expect(store.components.a?.groupId).toBeNull()
  })

  it('resizing from the top-left keeps children in place on the canvas', () => {
    const store = setup([at('a', 100, 100)])
    const { id } = store.groupComponents(['a']) as { id: string }
    const before = store.absolute(store.components.a!)
    const group = store.groups[id]!
    store.updateGroupGeometry(id, { x: group.x - 64, y: group.y - 32, w: group.w + 64 })
    expect(store.absolute(store.components.a!)).toEqual(before)
    store.updateGroupGeometry(id, { w: 10, h: 10 })
    expect(store.groups[id]).toMatchObject({ w: 240, h: 120 })
  })

  it('deletes with contents only when every child is editable', () => {
    const store = setup([at('a', 0, 0), at('b', 200, 0)])
    const { id } = store.groupComponents(['a', 'b']) as { id: string }
    store.components.b!.access.canEdit = false
    expect(store.deleteGroupWithContents(id)).toMatch(/cannot edit/)
    store.components.b!.access.canEdit = true
    expect(store.deleteGroupWithContents(id)).toBeNull()
    expect(store.components).toEqual({})
    store.undo()
    expect(Object.keys(store.components).sort()).toEqual(['a', 'b'])
    expect(store.groups[id]).toBeDefined()
  })

  it('Delete on a selected group keeps its contents', () => {
    const store = setup([at('a', 0, 0)])
    const { id } = store.groupComponents(['a']) as { id: string }
    store.removeSelection([id])
    expect(store.groups[id]).toBeUndefined()
    expect(store.components.a).toMatchObject({ groupId: null, x: 0, y: 0 })
  })

  it('nudging a group moves it, not its children separately', () => {
    const store = setup([at('a', 0, 0)])
    const { id } = store.groupComponents(['a']) as { id: string }
    const childBefore = { ...store.components.a! }
    store.nudge([id, 'a'], 16, 0)
    expect(store.components.a).toMatchObject({ x: childBefore.x, y: childBefore.y })
    expect(store.absolute(store.components.a!).x).toBe(16)
  })
})
