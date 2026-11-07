import type { CanvasComponent } from '@/api/types'

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

export type ComponentField = (typeof COMPONENT_FIELDS)[number]
export type ComponentFields = Pick<CanvasComponent, ComponentField>

export type LocalOp =
  | { kind: 'create'; component: CanvasComponent }
  | { kind: 'delete'; component: CanvasComponent }
  | {
      kind: 'update'
      id: string
      before: Partial<ComponentFields>
      after: Partial<ComponentFields>
    }

/** Ops that form one user action, and one undo step. */
export type Transaction = LocalOp[]

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
  }
}

/** The transaction that undoes `tx`: inverse ops in reverse order. */
export function invertTransaction(tx: Transaction): Transaction {
  return [...tx].reverse().map(invert)
}

/** Apply one op to a components map (mutates it). Ops on missing components are skipped. */
export function applyOp(components: Record<string, CanvasComponent>, op: LocalOp): void {
  switch (op.kind) {
    case 'create':
      components[op.component.id] = clone(op.component)
      break
    case 'delete':
      delete components[op.component.id]
      break
    case 'update': {
      const component = components[op.id]
      if (component) Object.assign(component, clone(op.after))
      break
    }
  }
}

/**
 * An update op for the fields of `patch` that actually differ from `component`,
 * or null when nothing changes.
 */
export function updateOp(
  component: CanvasComponent,
  patch: Partial<ComponentFields>,
): Extract<LocalOp, { kind: 'update' }> | null {
  const before: Partial<ComponentFields> = {}
  const after: Partial<ComponentFields> = {}
  for (const field of COMPONENT_FIELDS) {
    if (!(field in patch)) continue
    const next = patch[field]
    if (next === undefined || equal(component[field], next)) continue
    Object.assign(before, { [field]: clone(component[field]) })
    Object.assign(after, { [field]: clone(next) })
  }
  return Object.keys(after).length ? { kind: 'update', id: component.id, before, after } : null
}

/**
 * Combine two consecutive transactions into one undo step: updates of the same component
 * merge (earliest `before`, latest `after`); everything else is appended.
 */
export function mergeTransactions(first: Transaction, second: Transaction): Transaction {
  const merged = first.map((op) => ({ ...op }))
  for (const op of second) {
    const existing =
      op.kind === 'update' ? merged.find((m) => m.kind === 'update' && m.id === op.id) : undefined
    if (op.kind === 'update' && existing?.kind === 'update') {
      existing.before = { ...op.before, ...existing.before }
      existing.after = { ...existing.after, ...op.after }
    } else {
      merged.push(op)
    }
  }
  return merged
}
