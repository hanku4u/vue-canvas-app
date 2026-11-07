import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Canvas, CanvasComponent, CanvasRole } from '@/api/types'
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
