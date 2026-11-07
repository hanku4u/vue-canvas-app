import type { CanvasOp } from '@/api/types'
import {
  COMPONENT_FIELDS,
  GROUP_FIELDS,
  clone,
  type DocState,
  type GroupDeleteMode,
  type LocalOp,
} from './ops'

/**
 * What the server doesn't know yet, per entity (component or group). Recording ops here
 * (instead of queueing them) coalesces naturally: ten drags of one component become one
 * update; creating and deleting something before it was ever sent cancels out. Wire ops
 * are built at send time from the current local state, with each entity's latest server
 * version.
 */
interface EntityPending<D> {
  creates: Set<string>
  updates: Map<string, Set<string>>
  /** id → what the delete needs: the server version (and, for groups, the mode) */
  deletes: Map<string, D>
}

export interface PendingSnapshot {
  components: EntityPending<{ version: number }>
  groups: EntityPending<{ version: number; mode: GroupDeleteMode }>
}

function emptyEntity<D>(): EntityPending<D> {
  return { creates: new Set(), updates: new Map(), deletes: new Map() }
}

function emptySnapshot(): PendingSnapshot {
  return { components: emptyEntity(), groups: emptyEntity() }
}

function isEmptyEntity(entity: EntityPending<unknown>): boolean {
  return entity.creates.size === 0 && entity.updates.size === 0 && entity.deletes.size === 0
}

function entityHas(entity: EntityPending<unknown>, id: string): boolean {
  return entity.creates.has(id) || entity.updates.has(id) || entity.deletes.has(id)
}

// Shared bookkeeping for components and groups ------------------------------------------

function recordCreate<D>(entity: EntityPending<D>, id: string, allFields: readonly string[]): void {
  if (entity.deletes.has(id)) {
    // Re-created (undo of a delete) before the delete was sent: it still exists on the
    // server, so send its full state as an update instead.
    entity.deletes.delete(id)
    entity.updates.set(id, new Set(allFields))
  } else {
    entity.creates.add(id)
  }
}

function recordUpdate<D>(entity: EntityPending<D>, id: string, fields: string[]): void {
  if (entity.creates.has(id)) return // the create will send the current state
  const set = entity.updates.get(id) ?? new Set<string>()
  for (const field of fields) set.add(field)
  entity.updates.set(id, set)
}

function recordDelete<D>(entity: EntityPending<D>, id: string, info: D): void {
  entity.updates.delete(id)
  if (entity.creates.has(id))
    entity.creates.delete(id) // never reached the server
  else entity.deletes.set(id, info)
}

function restoreEntity<D>(
  current: EntityPending<D>,
  older: EntityPending<D>,
  allFields: readonly string[],
): void {
  for (const id of older.creates) {
    if (current.deletes.has(id))
      current.deletes.delete(id) // created then deleted
    else {
      current.updates.delete(id)
      current.creates.add(id)
    }
  }
  for (const [id, fields] of older.updates) {
    if (current.deletes.has(id) || current.creates.has(id)) continue
    const merged = current.updates.get(id) ?? new Set<string>()
    for (const field of fields) merged.add(field)
    current.updates.set(id, merged)
  }
  for (const [id, info] of older.deletes) {
    if (current.creates.has(id)) {
      // Deleted, then re-created locally: it still exists on the server.
      current.creates.delete(id)
      current.updates.set(id, new Set(allFields))
    } else if (!current.updates.has(id)) {
      current.deletes.set(id, info)
    }
  }
}

function forgetEntity(entity: EntityPending<unknown>, id: string): void {
  entity.creates.delete(id)
  entity.updates.delete(id)
  entity.deletes.delete(id)
}

export class PendingChanges {
  private state: PendingSnapshot = emptySnapshot()

  get isEmpty(): boolean {
    return isEmptyEntity(this.state.components) && isEmptyEntity(this.state.groups)
  }

  has(id: string): boolean {
    return entityHas(this.state.components, id) || entityHas(this.state.groups, id)
  }

  record(op: LocalOp): void {
    const { components, groups } = this.state
    switch (op.kind) {
      case 'create':
        return recordCreate(components, op.component.id, COMPONENT_FIELDS)
      case 'update':
        return recordUpdate(components, op.id, Object.keys(op.after))
      case 'delete':
        return recordDelete(components, op.component.id, { version: op.component.version })
      case 'createGroup':
        return recordCreate(groups, op.group.id, GROUP_FIELDS)
      case 'updateGroup':
        return recordUpdate(groups, op.id, Object.keys(op.after))
      case 'deleteGroup':
        return recordDelete(groups, op.group.id, { version: op.group.version, mode: op.mode })
    }
  }

  /** Take everything pending (for sending) and start empty. */
  take(): PendingSnapshot {
    const taken = this.state
    this.state = emptySnapshot()
    return taken
  }

  /**
   * Put a snapshot that failed to send back, under anything recorded since it was taken
   * (the snapshot is older).
   */
  restore(older: PendingSnapshot): void {
    restoreEntity(this.state.components, older.components, COMPONENT_FIELDS)
    restoreEntity(this.state.groups, older.groups, GROUP_FIELDS)
  }

  /** Drop everything pending for one entity (conflict resolved as "keep theirs"). */
  forget(id: string): void {
    forgetEntity(this.state.components, id)
    forgetEntity(this.state.groups, id)
  }

  /** Send the entity as a new create (it was deleted on the server meanwhile). */
  markCreate(id: string, kind: 'component' | 'group' = 'component'): void {
    this.forget(id)
    this.state[kind === 'group' ? 'groups' : 'components'].creates.add(id)
  }

  /** Retarget a pending delete at a newer server version ("reapply mine"). */
  retargetDelete(id: string, version: number): void {
    const component = this.state.components.deletes.get(id)
    if (component) component.version = version
    const group = this.state.groups.deletes.get(id)
    if (group) group.version = version
  }
}

export function snapshotIds(snapshot: PendingSnapshot): Set<string> {
  const ids = new Set<string>()
  for (const entity of [snapshot.components, snapshot.groups] as EntityPending<unknown>[]) {
    for (const id of entity.creates) ids.add(id)
    for (const id of entity.updates.keys()) ids.add(id)
    for (const id of entity.deletes.keys()) ids.add(id)
  }
  return ids
}

/**
 * Wire ops for a snapshot, from the current local document. Order matters (the server
 * applies ops in sequence): new groups first (components may join them), then component
 * creates and updates, group updates, component deletes, and group deletes last (after
 * their contents were moved out or deleted).
 */
export function buildOps(snapshot: PendingSnapshot, doc: DocState): CanvasOp[] {
  const ops: CanvasOp[] = []
  const { components, groups } = snapshot

  for (const id of groups.creates) {
    const g = doc.groups[id]
    if (!g) continue
    ops.push({
      op: 'group.create',
      group: clone({
        id: g.id,
        title: g.title,
        x: g.x,
        y: g.y,
        w: g.w,
        h: g.h,
        zIndex: g.zIndex,
        collapsed: g.collapsed,
        defaultFilters: g.defaultFilters,
      }),
    })
  }
  for (const id of components.creates) {
    const c = doc.components[id]
    if (!c) continue
    ops.push({
      op: 'component.create',
      component: clone({
        id: c.id,
        type: c.type,
        title: c.title,
        groupId: c.groupId,
        x: c.x,
        y: c.y,
        w: c.w,
        h: c.h,
        zIndex: c.zIndex,
        config: c.config,
        configVersion: c.configVersion,
      }),
    })
  }
  for (const [id, fields] of components.updates) {
    const c = doc.components[id]
    if (!c) continue
    const set = Object.fromEntries(
      [...fields].map((field) => [field, clone(c[field as keyof typeof c])]),
    )
    ops.push({ op: 'component.update', id, version: c.version, set })
  }
  for (const [id, fields] of groups.updates) {
    const g = doc.groups[id]
    if (!g) continue
    const set = Object.fromEntries(
      [...fields].map((field) => [field, clone(g[field as keyof typeof g])]),
    )
    ops.push({ op: 'group.update', id, version: g.version, set })
  }
  for (const [id, { version }] of components.deletes) {
    ops.push({ op: 'component.delete', id, version })
  }
  for (const [id, { version, mode }] of groups.deletes) {
    ops.push({ op: 'group.delete', id, version, mode })
  }
  return ops
}
