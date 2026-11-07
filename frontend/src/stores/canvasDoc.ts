import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { ApiError } from '@/api/client'
import type { Canvas, CanvasComponent, CanvasGroup, VersionConflict } from '@/api/types'
import { applyConfigPatch, getDefinition, resolveConfig } from '@/registry/registry'
import type { ComponentConfig } from '@/registry/types'
import {
  createCanvasSync,
  type CanvasSync,
  type CanvasSyncDeps,
  type SaveStatus,
} from '@/sync/canvasSync'
import { UndoHistory } from '@/sync/history'
import {
  applyOp,
  clone,
  updateCanvasOp,
  updateGroupOp,
  updateOp,
  type DocState,
  type LocalOp,
  type Transaction,
} from '@/sync/ops'
import { GRID } from '@/canvas/geometry'
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
  /** Position is relative to this group when set. */
  groupId?: string | null
}

export interface Point {
  x: number
  y: number
}

export interface Rect extends Point {
  w: number
  h: number
}

export const MAX_TITLE = 120

function pickCanvasFields(c: Canvas): Pick<Canvas, 'title' | 'description' | 'defaultFilters'> {
  return { title: c.title, description: c.description, defaultFilters: c.defaultFilters }
}

/** Offset for duplicated components, so the copy is visibly separate. */
const DUPLICATE_OFFSET = 32

/** Group frame layout (flow units): header height and padding around the contents. */
export const GROUP_HEADER = 40
export const GROUP_PADDING = 24
export const GROUP_MIN_SIZE = { w: 240, h: 120 }

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
 * The open canvas document: canvas metadata plus its groups and components, keyed by id.
 * Component positions are relative to their group (if any), else to the canvas.
 *
 * Every edit is a transaction of ops (src/sync/ops.ts): applied locally, recorded for
 * undo/redo, and queued for saving through POST /api/canvases/{id}/ops.
 */
export const useCanvasDocStore = defineStore('canvasDoc', () => {
  const canvas = ref<Canvas | null>(null)
  const components = ref<Record<string, CanvasComponent>>({})
  const groups = ref<Record<string, CanvasGroup>>({})
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
  const canManageAccess = computed(
    () => !!canvas.value && canvasCan.manageAccess(canvas.value.role),
  )

  /** Components in paint order (lowest zIndex first). */
  const ordered = computed(() =>
    Object.values(components.value).sort((a, b) => a.zIndex - b.zIndex),
  )
  const orderedGroups = computed(() =>
    Object.values(groups.value).sort((a, b) => a.zIndex - b.zIndex),
  )

  function doc(): DocState {
    return { components: components.value, groups: groups.value, canvas: canvas.value }
  }

  function configure(value: StoreOptions): void {
    options = value
  }

  // -------------------------------------------------------------------------
  // Geometry helpers
  // -------------------------------------------------------------------------

  /** Absolute (canvas) position of a component. */
  function absolute(component: Pick<CanvasComponent, 'x' | 'y' | 'groupId'>): Point {
    const group = component.groupId ? groups.value[component.groupId] : undefined
    return group
      ? { x: group.x + component.x, y: group.y + component.y }
      : { x: component.x, y: component.y }
  }

  function absoluteRect(component: CanvasComponent): Rect {
    return { ...absolute(component), w: component.w, h: component.h }
  }

  function childrenOf(groupId: string): CanvasComponent[] {
    return ordered.value.filter((c) => c.groupId === groupId)
  }

  /** The topmost expanded group whose frame contains `point`, if any. */
  function groupAt(point: Point): CanvasGroup | null {
    const hits = orderedGroups.value.filter(
      (g) =>
        !g.collapsed &&
        point.x >= g.x &&
        point.x <= g.x + g.w &&
        point.y >= g.y + GROUP_HEADER &&
        point.y <= g.y + g.h,
    )
    return hits[hits.length - 1] ?? null
  }

  /** Group membership and relative position for something at an absolute rect. */
  function placement(rect: Rect): { groupId: string | null; x: number; y: number } {
    const group = groupAt({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 })
    return group
      ? { groupId: group.id, x: rect.x - group.x, y: rect.y - group.y }
      : { groupId: null, x: rect.x, y: rect.y }
  }

  // -------------------------------------------------------------------------
  // Loading and syncing
  // -------------------------------------------------------------------------

  function load(value: Canvas): void {
    sync.value?.dispose()
    // A copy: the query cache's object is read-only, and the store updates version/revision.
    canvas.value = { ...value, components: [], groups: [] }
    components.value = Object.fromEntries(value.components.map((c) => [c.id, clone(c)]))
    groups.value = Object.fromEntries(value.groups.map((g) => [g.id, clone(g)]))
    history.clear()
    historyTick.value += 1
    conflicts.value = []
    rejection.value = null
    sync.value = createCanvasSync({
      canvasId: value.id,
      doc,
      debounceMs: options.syncDebounceMs,
      send: options.syncSend,
      onSaved: (_ops, result) => {
        for (const [id, version] of Object.entries(result.versions)) {
          if (id === 'canvas') {
            if (canvas.value) canvas.value.version = version
            continue
          }
          const entity = components.value[id] ?? groups.value[id]
          if (entity) entity.version = version
        }
        if (canvas.value) canvas.value.revision = result.revision
      },
      onConflict: (list) => {
        conflicts.value = list
      },
      onRejected: (error) => {
        rejection.value = error
      },
    })
    revision.value += 1
  }

  /** Replace local entities with the server's, except those with unsaved local edits. */
  function mergeEntities<T extends { id: string; version: number }>(
    local: Record<string, T>,
    remote: T[],
    same: (a: T, b: T) => boolean,
  ): boolean {
    const pending = (id: string) => sync.value?.hasPending(id) ?? false
    const remoteIds = new Set(remote.map((e) => e.id))
    let changed = false
    for (const entity of Object.values(local)) {
      // version 0: created locally, not saved yet.
      if (!remoteIds.has(entity.id) && entity.version > 0 && !pending(entity.id)) {
        delete local[entity.id]
        changed = true
      }
    }
    for (const server of remote) {
      if (pending(server.id)) continue
      const current = local[server.id]
      if (!current || !same(current, server)) {
        local[server.id] = clone(server)
        changed = true
      }
    }
    return changed
  }

  /**
   * Merge a fresh copy of the canvas from the server (e.g. on window focus): take the
   * server's version of everything without unsaved local edits.
   */
  function mergeRemote(remote: Canvas): void {
    if (!canvas.value || remote.id !== canvas.value.id) {
      load(remote)
      return
    }
    const keep = sync.value?.hasPending('canvas') && canvas.value
    canvas.value = keep
      ? {
          ...remote,
          ...pickCanvasFields(canvas.value!),
          version: canvas.value!.version,
          components: [],
          groups: [],
        }
      : { ...remote, components: [], groups: [] }
    const groupsChanged = mergeEntities(
      groups.value,
      remote.groups,
      (a, b) => a.version === b.version,
    )
    const componentsChanged = mergeEntities(
      components.value,
      remote.components,
      (a, b) => a.version === b.version && JSON.stringify(a.access) === JSON.stringify(b.access),
    )
    if (groupsChanged || componentsChanged) revision.value += 1
  }

  /** Save everything now; resolves when saved or blocked (offline, conflict, error). */
  async function flush(): Promise<void> {
    await sync.value?.flush()
  }

  /** Resolve the current conflicts for all conflicting entities at once. */
  function resolveConflicts(choice: 'theirs' | 'mine'): void {
    const engine = sync.value
    if (!engine) return
    for (const conflict of conflicts.value) {
      const id = conflict.id
      if (id === 'canvas') {
        // Canvas metadata (title / default filters): theirs replaces ours, or ours goes on
        // top of their version.
        const current = conflict.current as ({ version: number } & Partial<Canvas>) | null
        if (choice === 'theirs') {
          engine.pending.forget('canvas')
          if (current && canvas.value) {
            canvas.value = { ...canvas.value, ...current, components: [], groups: [] }
          }
        } else if (current && canvas.value) {
          canvas.value.version = current.version
        }
        continue
      }
      const current = conflict.current as (CanvasComponent | CanvasGroup) | null
      const isGroup =
        id in groups.value || (!!current && 'collapsed' in current && !('type' in current))
      const local = isGroup ? groups.value[id] : components.value[id]
      if (choice === 'theirs') {
        engine.pending.forget(id)
        if (isGroup) {
          if (current) groups.value[id] = clone(current as CanvasGroup)
          else delete groups.value[id]
        } else if (current) {
          components.value[id] = clone(current as CanvasComponent)
        } else {
          delete components.value[id]
        }
      } else if (current) {
        if (local) local.version = current.version
        else engine.pending.retargetDelete(id, current.version)
      } else if (local) {
        engine.pending.markCreate(id, isGroup ? 'group' : 'component') // deleted on the server
      } else {
        engine.pending.forget(id) // deleted on both sides
      }
    }
    conflicts.value = []
    revision.value += 1
    engine.resolved()
  }

  // -------------------------------------------------------------------------
  // Transactions, undo and redo
  // -------------------------------------------------------------------------

  function commit(tx: Transaction, commitOptions: CommitOptions = {}): void {
    if (!tx.length) return
    for (const op of tx) applyOp(doc(), op)
    if (commitOptions.history !== false) {
      history.push(tx, commitOptions.mergeKey)
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
  // Component edits
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
      groupId: input.groupId && groups.value[input.groupId] ? input.groupId : null,
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

  /**
   * Add components given absolute positions; each joins the group it lands in
   * (docs/canvas-ux.md: "When dropped inside a group, the component joins that group").
   */
  function placeComponents(inputs: NewComponentInput[]): CanvasComponent[] {
    return addComponents(inputs.map((input) => ({ ...input, ...placement(input) })))
  }

  function updateGeometry(updates: GeometryUpdate[], commitOptions: CommitOptions = {}): void {
    const tx: LocalOp[] = []
    for (const { id, ...patch } of updates) {
      const component = editable(id)
      const op = component && updateOp(component, patch)
      if (op) tx.push(op)
    }
    commit(tx, commitOptions)
  }

  /**
   * Finish a drag: new absolute positions for components (which may change group
   * membership) and new positions for groups, as one undo step.
   */
  function finishDrag(moved: { id: string; x: number; y: number }[]): void {
    const tx: LocalOp[] = []
    const movedGroups = new Set(moved.filter((m) => groups.value[m.id]).map((m) => m.id))
    for (const item of moved) {
      const group = groups.value[item.id]
      if (group) {
        if (!canEdit.value) continue
        const op = updateGroupOp(group, { x: item.x, y: item.y })
        if (op) tx.push(op)
        continue
      }
      const component = editable(item.id)
      if (!component) continue
      // Moved along with its (also dragged) group: membership stays.
      if (component.groupId && movedGroups.has(component.groupId)) continue
      // Membership is decided from where the group frames are *before* this drag.
      const target = placement({ x: item.x, y: item.y, w: component.w, h: component.h })
      const op = updateOp(component, target)
      if (op) tx.push(op)
    }
    commit(tx)
  }

  function nudge(ids: string[], dx: number, dy: number): void {
    const tx: LocalOp[] = []
    for (const id of ids) {
      const group = groups.value[id]
      if (group && canEdit.value) {
        const op = updateGroupOp(group, { x: group.x + dx, y: group.y + dy })
        if (op) tx.push(op)
        continue
      }
      const component = editable(id)
      // Grouped components move with their group if it's nudged too.
      if (!component || (component.groupId && ids.includes(component.groupId))) continue
      const op = updateOp(component, { x: component.x + dx, y: component.y + dy })
      if (op) tx.push(op)
    }
    commit(tx, { mergeKey: `nudge:${[...ids].sort().join(',')}` })
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
    configOptions: { replace?: boolean } = {},
  ): string | null {
    const component = editable(id)
    if (!component) return 'You cannot edit this component'
    const definition = getDefinition(component.type)
    if (!definition) return `Unknown component type '${component.type}'`
    const resolved = resolveConfig(definition, component)
    const base = configOptions.replace || !resolved.ok ? {} : resolved.config
    const result = applyConfigPatch(definition, base, patch)
    if (!result.ok) return result.error
    const op = updateOp(component, {
      config: result.config,
      configVersion: definition.configVersion,
    })
    if (op) commit([op])
    return null
  }

  function deleteOps(ids: string[]): LocalOp[] {
    return ids.map((id) => ({ kind: 'delete', component: clone(components.value[id]!) }))
  }

  /** Remove the editable components among `ids`; returns the ids actually removed. */
  function removeComponents(ids: string[]): string[] {
    const removed = ids.filter((id) => editable(id))
    commit(deleteOps(removed))
    return removed
  }

  /** Copy components (any the user can see, like copy/paste); returns the new ids. */
  function duplicateComponents(ids: string[]): string[] {
    const sources = ordered.value.filter((c) => ids.includes(c.id))
    return addComponents(
      sources.map((source) => ({
        type: source.type,
        title: source.title,
        groupId: source.groupId,
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

  // -------------------------------------------------------------------------
  // Saved default filters (docs/canvas-ux.md, Filters: "Save as default")
  // -------------------------------------------------------------------------

  function setCanvasDefaultFilters(filters: Canvas['defaultFilters']): void {
    if (!canvas.value || !canEdit.value) return
    const op = updateCanvasOp(canvas.value, { defaultFilters: filters })
    if (op) commit([op])
  }

  function setGroupDefaultFilters(id: string, filters: CanvasGroup['defaultFilters']): void {
    const group = groups.value[id]
    if (!group || !canEdit.value) return
    const op = updateGroupOp(group, { defaultFilters: filters })
    if (op) commit([op])
  }

  // -------------------------------------------------------------------------
  // Groups (docs/canvas-ux.md, "Groups")
  // -------------------------------------------------------------------------

  /** Op moving a component out of its group to the canvas, keeping its absolute place. */
  function detachOp(component: CanvasComponent): LocalOp | null {
    return updateOp(component, { groupId: null, ...absolute(component) })
  }

  /**
   * Put components in a new group whose frame wraps them with padding. Components from
   * other groups move over (one level of groups only). Returns the new group id, or an
   * error message.
   */
  function groupComponents(ids: string[], title = 'Group'): { id: string } | { error: string } {
    if (!canEdit.value) return { error: 'You cannot edit this canvas' }
    const selected = ordered.value.filter((c) => ids.includes(c.id))
    if (!selected.length) return { error: 'Select one or more components to group' }
    if (selected.some((c) => !editable(c.id))) {
      return { error: 'Some selected components are locked for you' }
    }
    const rects = selected.map(absoluteRect)
    const minX = Math.min(...rects.map((r) => r.x))
    const minY = Math.min(...rects.map((r) => r.y))
    const maxX = Math.max(...rects.map((r) => r.x + r.w))
    const maxY = Math.max(...rects.map((r) => r.y + r.h))
    const zIndexes = Object.values(groups.value).map((g) => g.zIndex)
    const group: CanvasGroup = {
      id: crypto.randomUUID(),
      title: title.slice(0, MAX_TITLE),
      // On the 16px grid, at least the padding away from the contents.
      x: Math.floor((minX - GROUP_PADDING) / GRID) * GRID,
      y: Math.floor((minY - GROUP_PADDING - GROUP_HEADER) / GRID) * GRID,
      w: 0,
      h: 0,
      zIndex: zIndexes.length ? Math.max(...zIndexes) + 1 : 0,
      collapsed: false,
      defaultFilters: {},
      version: 0,
    }
    group.w = Math.ceil((maxX + GROUP_PADDING - group.x) / GRID) * GRID
    group.h = Math.ceil((maxY + GROUP_PADDING - group.y) / GRID) * GRID
    const tx: LocalOp[] = [{ kind: 'createGroup', group }]
    selected.forEach((component, index) => {
      const rect = rects[index]!
      const op = updateOp(component, {
        groupId: group.id,
        x: rect.x - group.x,
        y: rect.y - group.y,
      })
      if (op) tx.push(op)
    })
    commit(tx)
    return { id: group.id }
  }

  /** Remove groups, keeping their contents on the canvas where they are. */
  function ungroup(groupIds: string[]): void {
    if (!canEdit.value) return
    const tx: LocalOp[] = []
    for (const id of groupIds) {
      const group = groups.value[id]
      if (!group) continue
      for (const child of childrenOf(id)) {
        // Locked children are moved out too: the group's layout belongs to its editors
        // (docs/permissions.md, edge cases). The server does the same for hidden ones.
        const op = detachOp(child)
        if (op) tx.push(op)
      }
      tx.push({ kind: 'deleteGroup', group: clone(group), mode: 'ungroup' })
    }
    commit(tx)
  }

  /** Delete a group and everything in it; refused if any child is locked for the user. */
  function deleteGroupWithContents(groupId: string): string | null {
    const group = groups.value[groupId]
    if (!group || !canEdit.value) return 'You cannot edit this canvas'
    const children = childrenOf(groupId)
    if (children.some((c) => !editable(c.id))) {
      return 'This group contains components you cannot edit'
    }
    commit([
      ...deleteOps(children.map((c) => c.id)),
      { kind: 'deleteGroup', group: clone(group), mode: 'withContents' },
    ])
    return null
  }

  function renameGroup(id: string, title: string): boolean {
    const group = groups.value[id]
    const value = title.trim().slice(0, MAX_TITLE)
    if (!group || !canEdit.value || !value) return false
    const op = updateGroupOp(group, { title: value })
    if (op) commit([op])
    return true
  }

  function setGroupCollapsed(id: string, collapsed: boolean): void {
    const group = groups.value[id]
    if (!group || !canEdit.value) return
    const op = updateGroupOp(group, { collapsed })
    if (op) commit([op])
  }

  /**
   * Resize/move a group frame. Contents keep their place on the canvas: when the frame's
   * top-left moves, children's relative positions are shifted back by the same amount.
   */
  function updateGroupGeometry(
    id: string,
    rect: Partial<Rect>,
    commitOptions: CommitOptions = {},
  ): void {
    const group = groups.value[id]
    if (!group || !canEdit.value) return
    const op = updateGroupOp(group, {
      x: rect.x,
      y: rect.y,
      w: rect.w === undefined ? undefined : Math.max(GROUP_MIN_SIZE.w, rect.w),
      h: rect.h === undefined ? undefined : Math.max(GROUP_MIN_SIZE.h, rect.h),
    })
    if (!op) return
    const tx: LocalOp[] = [op]
    const dx = (rect.x ?? group.x) - group.x
    const dy = (rect.y ?? group.y) - group.y
    if (dx || dy) {
      for (const child of childrenOf(id)) {
        const childOp = updateOp(child, { x: child.x - dx, y: child.y - dy })
        if (childOp) tx.push(childOp)
      }
    }
    commit(tx, commitOptions)
  }

  /**
   * Delete key / menu "Delete" for a mixed selection: components are deleted, groups are
   * removed keeping their contents (the safe default; "with contents" is a menu action).
   */
  function removeSelection(ids: string[]): void {
    if (!canEdit.value) return
    const groupIds = ids.filter((id) => groups.value[id])
    const componentIds = ids.filter((id) => editable(id))
    const tx: LocalOp[] = deleteOps(componentIds)
    for (const id of groupIds) {
      const group = groups.value[id]!
      for (const child of childrenOf(id)) {
        if (componentIds.includes(child.id)) continue
        const op = detachOp(child)
        if (op) tx.push(op)
      }
      tx.push({ kind: 'deleteGroup', group: clone(group), mode: 'ungroup' })
    }
    commit(tx)
  }

  return {
    canvas,
    components,
    groups,
    revision,
    dirty,
    saveStatus,
    conflicts,
    rejection,
    canEdit,
    canManageAccess,
    canUndo,
    canRedo,
    ordered,
    orderedGroups,
    configure,
    load,
    mergeRemote,
    flush,
    resolveConflicts,
    undo,
    redo,
    absolute,
    absoluteRect,
    childrenOf,
    groupAt,
    editable,
    addComponent,
    addComponents,
    placeComponents,
    updateGeometry,
    finishDrag,
    nudge,
    renameComponent,
    updateConfig,
    removeComponents,
    removeSelection,
    duplicateComponents,
    bringToFront,
    sendToBack,
    groupComponents,
    ungroup,
    deleteGroupWithContents,
    renameGroup,
    setGroupCollapsed,
    updateGroupGeometry,
    setCanvasDefaultFilters,
    setGroupDefaultFilters,
  }
})
