import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { Canvas, CanvasComponent } from '@/api/types'
import { canvasCan } from '@/ui/canvases/permissions'

export interface GeometryUpdate {
  id: string
  x?: number
  y?: number
  w?: number
  h?: number
}

export interface NewComponentInput {
  type: string
  title: string
  x: number
  y: number
  w: number
  h: number
  config?: Record<string, unknown>
}

/**
 * The open canvas document: canvas metadata plus its components, keyed by id.
 *
 * F2: edits are local only. F4 turns every mutation into an op (with an inverse for
 * undo) and syncs it to POST /api/canvases/{id}/ops.
 */
export const useCanvasDocStore = defineStore('canvasDoc', () => {
  const canvas = ref<Canvas | null>(null)
  const components = ref<Record<string, CanvasComponent>>({})
  /** Bumped on every local change, so views can re-derive from the store. */
  const revision = ref(0)
  /** True once something changed locally that the server doesn't have. */
  const dirty = ref(false)

  const canEdit = computed(() => !!canvas.value && canvasCan.edit(canvas.value.role))

  /** Components in paint order (lowest zIndex first). */
  const ordered = computed(() =>
    Object.values(components.value).sort((a, b) => a.zIndex - b.zIndex),
  )

  function changed(): void {
    revision.value += 1
    dirty.value = true
  }

  function load(value: Canvas): void {
    canvas.value = value
    components.value = Object.fromEntries(value.components.map((c) => [c.id, { ...c }]))
    dirty.value = false
    revision.value += 1
  }

  function editable(id: string): CanvasComponent | null {
    const component = components.value[id]
    return component && canEdit.value && component.access.canEdit ? component : null
  }

  function zRange(): { min: number; max: number } {
    const values = Object.values(components.value).map((c) => c.zIndex)
    return values.length
      ? { min: Math.min(...values), max: Math.max(...values) }
      : { min: 0, max: 0 }
  }

  function addComponent(input: NewComponentInput): CanvasComponent | null {
    if (!canEdit.value) return null
    const component: CanvasComponent = {
      id: crypto.randomUUID(),
      type: input.type,
      title: input.title,
      groupId: null,
      x: input.x,
      y: input.y,
      w: input.w,
      h: input.h,
      zIndex: Object.keys(components.value).length ? zRange().max + 1 : 0,
      config: input.config ?? {},
      configVersion: 1,
      version: 0,
      access: { canEdit: true, viewRestricted: false, editRestricted: false },
      updatedBy: '',
      updatedAt: new Date().toISOString(),
    }
    components.value[component.id] = component
    changed()
    return component
  }

  function updateGeometry(updates: GeometryUpdate[]): void {
    let any = false
    for (const update of updates) {
      const component = editable(update.id)
      if (!component) continue
      for (const field of ['x', 'y', 'w', 'h'] as const) {
        const value = update[field]
        if (value !== undefined && value !== component[field]) {
          component[field] = value
          any = true
        }
      }
    }
    if (any) changed()
  }

  function nudge(ids: string[], dx: number, dy: number): void {
    updateGeometry(
      ids.flatMap((id) => {
        const c = components.value[id]
        return c ? [{ id, x: c.x + dx, y: c.y + dy }] : []
      }),
    )
  }

  /** Remove the editable components among `ids`; returns the ids actually removed. */
  function removeComponents(ids: string[]): string[] {
    const removed = ids.filter((id) => editable(id))
    for (const id of removed) delete components.value[id]
    if (removed.length) changed()
    return removed
  }

  function restack(ids: string[], direction: 'front' | 'back'): void {
    const targets = ordered.value.filter((c) => ids.includes(c.id) && editable(c.id))
    if (!targets.length) return
    const { min, max } = zRange()
    targets.forEach((component, index) => {
      component.zIndex = direction === 'front' ? max + 1 + index : min - targets.length + index
    })
    changed()
  }

  const bringToFront = (ids: string[]) => restack(ids, 'front')
  const sendToBack = (ids: string[]) => restack(ids, 'back')

  return {
    canvas,
    components,
    revision,
    dirty,
    canEdit,
    ordered,
    load,
    addComponent,
    updateGeometry,
    nudge,
    removeComponents,
    bringToFront,
    sendToBack,
  }
})
