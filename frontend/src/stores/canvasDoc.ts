import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { ApiError } from '@/api/client'
import type { Canvas, CanvasComponent, VersionConflict } from '@/api/types'
import { applyConfigPatch, getDefinition, resolveConfig } from '@/registry/registry'
import type { ComponentConfig } from '@/registry/types'
import {
  createCanvasSync,
  type CanvasSync,
  type CanvasSyncDeps,
  type SaveStatus,
} from '@/sync/canvasSync'
import { UndoHistory } from '@/sync/history'
import { applyOp, clone, updateOp, type LocalOp, type Transaction } from '@/sync/ops'
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
  configVersion?: number
}

export const MAX_TITLE = 120

/** Offset for duplicated components, so the copy is visibly separate. */
const DUPLICATE_OFFSET = 32

export interface CommitOptions {
  /** Record as an undo step (default true). */
  history?: boolean
  /** Consecutive commits with the same key within a second form one undo step. */
  mergeKey?: string
}

export interface StoreOptions {
  /** Sync debounce (tests use 0). */
  syncDebounceMs?: number
  /** Replace the ops sender (tests). */
  syncSend?: CanvasSyncDeps['send']
}

/**
 * The open canvas document: canvas metadata plus its components, keyed by id.
 *
 * Every edit is a transaction of ops (src/sync/ops.ts): applied locally, recorded for
 * undo/redo, and queued for saving through POST /api/canvases/{id}/ops.
 */
export const useCanvasDocStore = defineStore('canvasDoc', () => {
  const canvas = ref<Canvas | null>(null)
  const components = ref<Record<string, CanvasComponent>>({})
  /** Bumped on every local change, so views can re-derive from the store. */
  const revision = ref(0)

  const history = new UndoHistory()
  const historyTick = ref(0)
  const canUndo = computed(() => historyTick.value >= 0 && history.canUndo)
  const canRedo = computed(() => historyTick.value >= 0 && history.canRedo)

  const sync = shallowRef<CanvasSync | null>(null)
  const conflicts = ref<VersionConflict[]>([])
  /** Set when the server refused our edits for good; the page reloads the canvas. */
  const rejection = ref<ApiError | null>(null)
  let options: StoreOptions = {}

  const saveStatus = computed<SaveStatus>(() => sync.value?.status.value ?? 'saved')
  const dirty = computed(() => saveStatus.value !== 'saved')
  const canEdit = computed(() => !!canvas.value && canvasCan.edit(canvas.value.role))

  /** Components in paint order (lowest zIndex first). */
  const ordered = computed(() =>
    Object.values(components.value).sort((a, b) => a.zIndex - b.zIndex),
  )

  function configure(value: StoreOptions): void {
    options = value
  }

  // -------------------------------------------------------------------------
  // Loading and syncing
  // -------------------------------------------------------------------------

  function load(value: Canvas): void {
    sync.value?.dispose()
    canvas.value = value
    components.value = Object.fromEntries(value.components.map((c) => [c.id, clone(c)]))
    history.clear()
    historyTick.value += 1
    conflicts.value = []
    rejection.value = null
    sync.value = createCanvasSync({
      canvasId: value.id,
      components: () => components.value,
      debounceMs: options.syncDebounceMs,
      send: options.syncSend,
      onSaved: (_ops, result) => {
        for (const [id, version] of Object.entries(result.versions)) {
          if (id === 'canvas') {
            if (canvas.value) canvas.value.version = version
          } else {
            const component = components.value[id]
            if (component) component.version = version
          }
        }
        if (canvas.value) canvas.value.revision = result.revision
      },
      onConflict: (list) => {
        conflicts.value = list.filter((c) => c.id !== 'canvas')
      },
      onRejected: (error) => {
        rejection.value = error
      },
    })
    revision.value += 1
  }

  /**
   * Merge a fresh copy of the canvas from the server (e.g. on window focus): take the
   * server's version of every component without unsaved local edits.
   */
  function mergeRemote(remote: Canvas): void {
    if (!canvas.value || remote.id !== canvas.value.id) {
      load(remote)
      return
    }
    canvas.value = { ...remote, components: [] }
    const pending = (id: string) => sync.value?.hasPending(id) ?? false
    const remoteIds = new Set(remote.components.map((c) => c.id))
    let changed = false
    for (const local of Object.values(components.value)) {
      // version 0: created locally, not saved yet.
      if (!remoteIds.has(local.id) && local.version > 0 && !pending(local.id)) {
        delete components.value[local.id]
        changed = true
      }
    }
    for (const server of remote.components) {
      if (pending(server.id)) continue
      const local = components.value[server.id]
      if (
        !local ||
        local.version !== server.version ||
        JSON.stringify(local.access) !== JSON.stringify(server.access)
      ) {
        components.value[server.id] = clone(server)
        changed = true
      }
    }
    if (changed) revision.value += 1
  }

  /** Save everything now; resolves when saved or blocked (offline, conflict, error). */
  async function flush(): Promise<void> {
    await sync.value?.flush()
  }

  /** Resolve the current conflicts for all conflicting components at once. */
  function resolveConflicts(choice: 'theirs' | 'mine'): void {
    const engine = sync.value
    if (!engine) return
    for (const conflict of conflicts.value) {
      const current = conflict.current as CanvasComponent | null
      const local = components.value[conflict.id]
      if (choice === 'theirs') {
        engine.pending.forget(conflict.id)
        if (current) components.value[conflict.id] = clone(current)
        else delete components.value[conflict.id]
      } else if (current) {
        if (local) local.version = current.version
        else engine.pending.retargetDelete(conflict.id, current.version)
      } else if (local) {
        engine.pending.markCreate(conflict.id) // deleted on the server: create it again
      } else {
        engine.pending.forget(conflict.id) // deleted on both sides
      }
    }
    conflicts.value = []
    revision.value += 1
    engine.resolved()
  }

  // -------------------------------------------------------------------------
  // Transactions, undo and redo
  // -------------------------------------------------------------------------

  function commit(tx: Transaction, options: CommitOptions = {}): void {
    if (!tx.length) return
    for (const op of tx) applyOp(components.value, op)
    if (options.history !== false) {
      history.push(tx, options.mergeKey)
      historyTick.value += 1
    }
    sync.value?.record(tx)
    revision.value += 1
  }

  function undo(): boolean {
    if (!canEdit.value) return false
    const tx = history.undo()
    historyTick.value += 1
    if (!tx) return false
    commit(tx, { history: false })
    return true
  }

  function redo(): boolean {
    if (!canEdit.value) return false
    const tx = history.redo()
    historyTick.value += 1
    if (!tx) return false
    commit(tx, { history: false })
    return true
  }

  // -------------------------------------------------------------------------
  // Edits
  // -------------------------------------------------------------------------

  /** The component if the current user may change it, otherwise null. */
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

  function newComponent(input: NewComponentInput, zIndex: number): CanvasComponent {
    return {
      id: crypto.randomUUID(),
      type: input.type,
      title: input.title.slice(0, MAX_TITLE),
      groupId: null,
      x: input.x,
      y: input.y,
      w: input.w,
      h: input.h,
      zIndex,
      config: clone(input.config ?? {}),
      configVersion: input.configVersion ?? 1,
      version: 0,
      access: { canEdit: true, viewRestricted: false, editRestricted: false },
      updatedBy: '',
      updatedAt: new Date().toISOString(),
    }
  }

  /** Add components in one undo step; returns them. */
  function addComponents(inputs: NewComponentInput[]): CanvasComponent[] {
    if (!canEdit.value || !inputs.length) return []
    const base = Object.keys(components.value).length ? zRange().max + 1 : 0
    const created = inputs.map((input, index) => newComponent(input, base + index))
    commit(created.map((component) => ({ kind: 'create', component })))
    return created
  }

  function addComponent(input: NewComponentInput): CanvasComponent | null {
    return addComponents([input])[0] ?? null
  }

  function updateGeometry(updates: GeometryUpdate[], options: CommitOptions = {}): void {
    const tx: LocalOp[] = []
    for (const { id, ...patch } of updates) {
      const component = editable(id)
      const op = component && updateOp(component, patch)
      if (op) tx.push(op)
    }
    commit(tx, options)
  }

  function nudge(ids: string[], dx: number, dy: number): void {
    updateGeometry(
      ids.flatMap((id) => {
        const c = components.value[id]
        return c ? [{ id, x: c.x + dx, y: c.y + dy }] : []
      }),
      { mergeKey: `nudge:${[...ids].sort().join(',')}` },
    )
  }

  /** Rename a component. Returns false when not allowed or the title is empty. */
  function renameComponent(id: string, title: string): boolean {
    const component = editable(id)
    const value = title.trim().slice(0, MAX_TITLE)
    if (!component || !value) return false
    const op = updateOp(component, { title: value })
    if (op) commit([op])
    return true
  }

  /**
   * Merge `patch` into a component's config, validated against its type's schema.
   * Returns null on success or an error message. `replace` swaps the whole config
   * (used to reset an invalid config to defaults).
   */
  function updateConfig(
    id: string,
    patch: ComponentConfig,
    options: { replace?: boolean } = {},
  ): string | null {
    const component = editable(id)
    if (!component) return 'You cannot edit this component'
    const definition = getDefinition(component.type)
    if (!definition) return `Unknown component type '${component.type}'`
    const resolved = resolveConfig(definition, component)
    const base = options.replace || !resolved.ok ? {} : resolved.config
    const result = applyConfigPatch(definition, base, patch)
    if (!result.ok) return result.error
    const op = updateOp(component, {
      config: result.config,
      configVersion: definition.configVersion,
    })
    if (op) commit([op])
    return null
  }

  /** Remove the editable components among `ids`; returns the ids actually removed. */
  function removeComponents(ids: string[]): string[] {
    const removed = ids.filter((id) => editable(id))
    commit(removed.map((id) => ({ kind: 'delete', component: clone(components.value[id]!) })))
    return removed
  }

  /** Copy components (any the user can see, like copy/paste); returns the new ids. */
  function duplicateComponents(ids: string[]): string[] {
    const sources = ordered.value.filter((c) => ids.includes(c.id))
    return addComponents(
      sources.map((source) => ({
        type: source.type,
        title: source.title,
        x: source.x + DUPLICATE_OFFSET,
        y: source.y + DUPLICATE_OFFSET,
        w: source.w,
        h: source.h,
        config: source.config,
        configVersion: source.configVersion,
      })),
    ).map((c) => c.id)
  }

  function restack(ids: string[], direction: 'front' | 'back'): void {
    const targets = ordered.value.filter((c) => ids.includes(c.id) && editable(c.id))
    if (!targets.length) return
    const { min, max } = zRange()
    const tx = targets.flatMap((component, index) => {
      const zIndex = direction === 'front' ? max + 1 + index : min - targets.length + index
      const op = updateOp(component, { zIndex })
      return op ? [op] : []
    })
    commit(tx)
  }

  const bringToFront = (ids: string[]) => restack(ids, 'front')
  const sendToBack = (ids: string[]) => restack(ids, 'back')

  return {
    canvas,
    components,
    revision,
    dirty,
    saveStatus,
    conflicts,
    rejection,
    canEdit,
    canUndo,
    canRedo,
    ordered,
    configure,
    load,
    mergeRemote,
    flush,
    resolveConflicts,
    undo,
    redo,
    editable,
    addComponent,
    addComponents,
    updateGeometry,
    nudge,
    renameComponent,
    updateConfig,
    removeComponents,
    duplicateComponents,
    bringToFront,
    sendToBack,
  }
})
