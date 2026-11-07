import type { CanvasComponent, CanvasGroup } from '@/api/types'

/**
 * Local operations on the canvas document. Every edit is expressed as ops so that the same
 * code path serves applying an edit, undoing/redoing it (inverse ops) and syncing it to
 * the server (see pending.ts).
 */

export const COMPONENT_FIELDS = [
  'title',
  'groupId',
  'x',
  'y',
  'w',
  'h',
  'zIndex',
  'config',
  'configVersion',
] as const

export const GROUP_FIELDS = [
  'title',
  'x',
  'y',
  'w',
  'h',
  'zIndex',
  'collapsed',
  'defaultFilters',
] as const

export type ComponentField = (typeof COMPONENT_FIELDS)[number]
export type ComponentFields = Pick<CanvasComponent, ComponentField>
export type GroupField = (typeof GROUP_FIELDS)[number]
export type GroupFields = Pick<CanvasGroup, GroupField>

/** How a group delete treats its contents (docs/api.md, group.delete). */
export type GroupDeleteMode = 'ungroup' | 'withContents'

export type LocalOp =
  | { kind: 'create'; component: CanvasComponent }
  | { kind: 'delete'; component: CanvasComponent }
  | {
      kind: 'update'
      id: string
      before: Partial<ComponentFields>
      after: Partial<ComponentFields>
    }
  | { kind: 'createGroup'; group: CanvasGroup }
  | { kind: 'deleteGroup'; group: CanvasGroup; mode: GroupDeleteMode }
  | { kind: 'updateGroup'; id: string; before: Partial<GroupFields>; after: Partial<GroupFields> }

/** Ops that form one user action, and one undo step. */
export type Transaction = LocalOp[]

/** The parts of the document ops apply to. */
export interface DocState {
  components: Record<string, CanvasComponent>
  groups: Record<string, CanvasGroup>
}

/** Deep copy of plain JSON data (also strips Vue reactive proxies). */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function equal(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b)
}

export function invert(op: LocalOp): LocalOp {
  switch (op.kind) {
    case 'create':
      return { kind: 'delete', component: op.component }
    case 'delete':
      return { kind: 'create', component: op.component }
    case 'update':
      return { kind: 'update', id: op.id, before: op.after, after: op.before }
    case 'createGroup':
      return { kind: 'deleteGroup', group: op.group, mode: 'ungroup' }
    case 'deleteGroup':
      return { kind: 'createGroup', group: op.group }
    case 'updateGroup':
      return { kind: 'updateGroup', id: op.id, before: op.after, after: op.before }
  }
}

/** The transaction that undoes `tx`: inverse ops in reverse order. */
export function invertTransaction(tx: Transaction): Transaction {
  return [...tx].reverse().map(invert)
}

/** Apply one op to the document (mutates it). Ops on missing entities are skipped. */
export function applyOp(doc: DocState, op: LocalOp): void {
  switch (op.kind) {
    case 'create':
      doc.components[op.component.id] = clone(op.component)
      break
    case 'delete':
      delete doc.components[op.component.id]
      break
    case 'update': {
      const component = doc.components[op.id]
      if (component) Object.assign(component, clone(op.after))
      break
    }
    case 'createGroup':
      doc.groups[op.group.id] = clone(op.group)
      break
    case 'deleteGroup':
      delete doc.groups[op.group.id]
      break
    case 'updateGroup': {
      const group = doc.groups[op.id]
      if (group) Object.assign(group, clone(op.after))
      break
    }
  }
}

function diff<T extends object, F extends keyof T & string>(
  entity: T,
  fields: readonly F[],
  patch: Partial<Pick<T, F>>,
): { before: Partial<Pick<T, F>>; after: Partial<Pick<T, F>> } | null {
  const before: Partial<Pick<T, F>> = {}
  const after: Partial<Pick<T, F>> = {}
  for (const field of fields) {
    if (!(field in patch)) continue
    const next = patch[field]
    if (next === undefined || equal(entity[field], next)) continue
    before[field] = clone(entity[field])
    after[field] = clone(next) as T[F]
  }
  return Object.keys(after).length ? { before, after } : null
}

/**
 * An update op for the fields of `patch` that actually differ from `component`,
 * or null when nothing changes.
 */
export function updateOp(
  component: CanvasComponent,
  patch: Partial<ComponentFields>,
): Extract<LocalOp, { kind: 'update' }> | null {
  const changes = diff(component, COMPONENT_FIELDS, patch)
  return changes ? { kind: 'update', id: component.id, ...changes } : null
}

/** Like updateOp, for groups. */
export function updateGroupOp(
  group: CanvasGroup,
  patch: Partial<GroupFields>,
): Extract<LocalOp, { kind: 'updateGroup' }> | null {
  const changes = diff(group, GROUP_FIELDS, patch)
  return changes ? { kind: 'updateGroup', id: group.id, ...changes } : null
}

/**
 * Combine two consecutive transactions into one undo step: updates of the same entity
 * merge (earliest `before`, latest `after`); everything else is appended.
 */
export function mergeTransactions(first: Transaction, second: Transaction): Transaction {
  const merged = first.map((op) => ({ ...op }))
  for (const op of second) {
    if (op.kind === 'update' || op.kind === 'updateGroup') {
      const existing = merged.find(
        (m): m is typeof op => m.kind === op.kind && 'id' in m && m.id === op.id,
      )
      if (existing) {
        existing.before = { ...op.before, ...existing.before }
        existing.after = { ...existing.after, ...op.after }
        continue
      }
    }
    merged.push(op)
  }
  return merged
}
