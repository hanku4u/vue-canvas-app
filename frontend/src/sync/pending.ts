import type { CanvasComponent, CanvasOp } from '@/api/types'
import { COMPONENT_FIELDS, clone, type ComponentField, type LocalOp } from './ops'

/**
 * What the server doesn't know yet, per component. Recording ops here (instead of queueing
 * them) coalesces naturally: ten drags of one component become one update; creating and
 * deleting a component before it was ever sent cancels out. Wire ops are built at send
 * time from the current local state, with each component's latest server version.
 */
export interface PendingSnapshot {
  creates: Set<string>
  updates: Map<string, Set<ComponentField>>
  /** id → server version the delete applies to */
  deletes: Map<string, number>
}

function emptySnapshot(): PendingSnapshot {
  return { creates: new Set(), updates: new Map(), deletes: new Map() }
}

const ALL_FIELDS = (): Set<ComponentField> => new Set(COMPONENT_FIELDS)

export class PendingChanges {
  private state: PendingSnapshot = emptySnapshot()

  get isEmpty(): boolean {
    const { creates, updates, deletes } = this.state
    return creates.size === 0 && updates.size === 0 && deletes.size === 0
  }

  has(id: string): boolean {
    const { creates, updates, deletes } = this.state
    return creates.has(id) || updates.has(id) || deletes.has(id)
  }

  record(op: LocalOp): void {
    const { creates, updates, deletes } = this.state
    switch (op.kind) {
      case 'create': {
        const id = op.component.id
        if (deletes.has(id)) {
          // Re-created (undo of a delete) before the delete was sent: it still exists on the
          // server, so send its full state as an update instead.
          deletes.delete(id)
          updates.set(id, ALL_FIELDS())
        } else {
          creates.add(id)
        }
        break
      }
      case 'update': {
        if (creates.has(op.id)) break // the create will send the current state
        const fields = updates.get(op.id) ?? new Set<ComponentField>()
        for (const field of Object.keys(op.after) as ComponentField[]) fields.add(field)
        updates.set(op.id, fields)
        break
      }
      case 'delete': {
        const id = op.component.id
        updates.delete(id)
        if (creates.has(id))
          creates.delete(id) // never reached the server
        else deletes.set(id, op.component.version)
        break
      }
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
    const { creates, updates, deletes } = this.state
    for (const id of older.creates) {
      if (deletes.has(id))
        deletes.delete(id) // created then deleted: never existed
      else {
        updates.delete(id)
        creates.add(id)
      }
    }
    for (const [id, fields] of older.updates) {
      if (deletes.has(id) || creates.has(id)) continue
      const merged = updates.get(id) ?? new Set<ComponentField>()
      for (const field of fields) merged.add(field)
      updates.set(id, merged)
    }
    for (const [id, version] of older.deletes) {
      if (creates.has(id)) {
        // Deleted, then re-created locally: it still exists on the server.
        creates.delete(id)
        updates.set(id, ALL_FIELDS())
      } else if (!updates.has(id)) {
        deletes.set(id, version)
      }
    }
  }

  /** Drop everything pending for one component (conflict resolved as "keep theirs"). */
  forget(id: string): void {
    this.state.creates.delete(id)
    this.state.updates.delete(id)
    this.state.deletes.delete(id)
  }

  /** Send the component as a new create (it was deleted on the server meanwhile). */
  markCreate(id: string): void {
    this.forget(id)
    this.state.creates.add(id)
  }

  /** Retarget a pending delete at a newer server version ("reapply mine"). */
  retargetDelete(id: string, version: number): void {
    if (this.state.deletes.has(id)) this.state.deletes.set(id, version)
  }
}

export function snapshotIds(snapshot: PendingSnapshot): Set<string> {
  return new Set([...snapshot.creates, ...snapshot.updates.keys(), ...snapshot.deletes.keys()])
}

/** Wire ops for a snapshot, from the current local components. */
export function buildOps(
  snapshot: PendingSnapshot,
  components: Record<string, CanvasComponent>,
): CanvasOp[] {
  const ops: CanvasOp[] = []
  for (const id of snapshot.creates) {
    const c = components[id]
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
  for (const [id, fields] of snapshot.updates) {
    const c = components[id]
    if (!c) continue
    const set = Object.fromEntries([...fields].map((field) => [field, clone(c[field])]))
    ops.push({ op: 'component.update', id, version: c.version, set })
  }
  for (const [id, version] of snapshot.deletes) {
    ops.push({ op: 'component.delete', id, version })
  }
  return ops
}
