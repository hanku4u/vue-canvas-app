import { ref, type Ref } from 'vue'
import { applyOps } from '@/api/canvases'
import { ApiError } from '@/api/client'
import type { CanvasComponent, CanvasOp, OpsResult, VersionConflict } from '@/api/types'
import type { Transaction } from './ops'
import { buildOps, PendingChanges, snapshotIds, type PendingSnapshot } from './pending'

/**
 * - saved: the server has everything
 * - pending: local edits waiting for the debounce
 * - saving: a batch is in flight
 * - offline: sending failed (network / server error); retrying with backoff
 * - conflict: someone else changed a component we edited; waiting for the user
 * - error: the server rejected the edits for good (e.g. permissions); see `lastError`
 */
export type SaveStatus = 'saved' | 'pending' | 'saving' | 'offline' | 'conflict' | 'error'

export interface CanvasSyncDeps {
  canvasId: string
  components: () => Record<string, CanvasComponent>
  /** A batch was saved; apply the new server versions. */
  onSaved: (ops: CanvasOp[], result: OpsResult) => void
  /** The server reported version conflicts; resolve them, then call `resolved()`. */
  onConflict: (conflicts: VersionConflict[]) => void
  /** The server refused the edits (403 / 404 / 400). Local state should be reloaded. */
  onRejected: (error: ApiError) => void
  debounceMs?: number
  /** Send function (injectable for tests). */
  send?: (canvasId: string, ops: CanvasOp[]) => Promise<OpsResult>
}

export interface CanvasSync {
  status: Ref<SaveStatus>
  lastError: Ref<ApiError | null>
  record: (tx: Transaction) => void
  /** Send now; resolves when idle (saved) or blocked (offline / conflict / error). */
  flush: () => Promise<void>
  hasPending: (id: string) => boolean
  pending: PendingChanges
  /** Call after conflicts were resolved (pending state adjusted). */
  resolved: () => void
  dispose: () => void
}

const MAX_BACKOFF_MS = 30_000

export function createCanvasSync(deps: CanvasSyncDeps): CanvasSync {
  const debounceMs = deps.debounceMs ?? 1000
  const send = deps.send ?? applyOps
  const status = ref<SaveStatus>('saved')
  const lastError = ref<ApiError | null>(null)
  const pending = new PendingChanges()

  let inflight: PendingSnapshot | null = null
  let inflightPromise: Promise<void> | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let backoff = 1000
  let disposed = false

  function schedule(delay: number): void {
    clearTimeout(timer)
    if (!disposed) timer = setTimeout(() => void sendBatch(), delay)
  }

  function idleStatus(): SaveStatus {
    return pending.isEmpty ? 'saved' : 'pending'
  }

  function record(tx: Transaction): void {
    for (const op of tx) pending.record(op)
    if (status.value === 'conflict' || status.value === 'error') return
    if (status.value === 'saved') status.value = 'pending'
    if (status.value !== 'offline') schedule(debounceMs)
  }

  async function sendBatch(): Promise<void> {
    if (inflight || disposed || pending.isEmpty) return
    if (status.value === 'conflict' || status.value === 'error') return
    const snapshot = pending.take()
    const ops = buildOps(snapshot, deps.components())
    if (!ops.length) {
      status.value = idleStatus()
      return
    }
    inflight = snapshot
    status.value = 'saving'
    const attempt = (async () => {
      try {
        const result = await send(deps.canvasId, ops)
        inflight = null
        backoff = 1000
        lastError.value = null
        deps.onSaved(ops, result)
        status.value = idleStatus()
        if (!pending.isEmpty) schedule(debounceMs)
      } catch (error) {
        inflight = null
        const apiError =
          error instanceof ApiError ? error : new ApiError(0, 'NETWORK_ERROR', String(error))
        lastError.value = apiError
        if (apiError.code === 'VERSION_CONFLICT') {
          pending.restore(snapshot)
          status.value = 'conflict'
          const details = apiError.details as { conflicts?: VersionConflict[] } | undefined
          deps.onConflict(details?.conflicts ?? [])
        } else if (apiError.status === 0 || apiError.status >= 500 || apiError.status === 429) {
          pending.restore(snapshot)
          status.value = 'offline'
          schedule(backoff)
          backoff = Math.min(backoff * 2, MAX_BACKOFF_MS)
        } else {
          // 400 / 403 / 404: retrying won't help.
          status.value = 'error'
          deps.onRejected(apiError)
        }
      }
    })()
    inflightPromise = attempt
    await attempt
    inflightPromise = null
  }

  async function flush(): Promise<void> {
    clearTimeout(timer)
    // Loop: edits made while a batch was in flight go out in the next one.
    for (let i = 0; i < 20; i += 1) {
      if (inflightPromise) await inflightPromise
      if (pending.isEmpty || status.value === 'conflict' || status.value === 'error') return
      if (status.value === 'offline' && i > 0) return
      await sendBatch()
    }
  }

  function hasPending(id: string): boolean {
    return pending.has(id) || (inflight !== null && snapshotIds(inflight).has(id))
  }

  function resolved(): void {
    lastError.value = null
    status.value = idleStatus()
    if (!pending.isEmpty) schedule(0)
  }

  function dispose(): void {
    disposed = true
    clearTimeout(timer)
  }

  return { status, lastError, record, flush, hasPending, pending, resolved, dispose }
}
