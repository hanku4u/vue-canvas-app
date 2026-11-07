import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import type { CanvasComponent, CanvasOp, OpsResult } from '@/api/types'
import { createCanvasSync, type CanvasSyncDeps } from '@/sync/canvasSync'
import { makeComponent } from './fixtures'

function setup(send: (ops: CanvasOp[]) => Promise<OpsResult>, debounceMs = 0) {
  const components: Record<string, CanvasComponent> = {
    a: makeComponent('a', { version: 1 }),
    b: makeComponent('b', { version: 1 }),
  }
  const sent: CanvasOp[][] = []
  const deps: CanvasSyncDeps = {
    canvasId: 'c1',
    doc: () => ({ components, groups: {} }),
    debounceMs,
    send: async (_id, ops) => {
      sent.push(ops)
      return send(ops)
    },
    onSaved: vi.fn<CanvasSyncDeps['onSaved']>((_ops, result) => {
      for (const [id, version] of Object.entries(result.versions)) {
        if (components[id]) components[id].version = version
      }
    }),
    onConflict: vi.fn<CanvasSyncDeps['onConflict']>(),
    onRejected: vi.fn<CanvasSyncDeps['onRejected']>(),
  }
  return { sync: createCanvasSync(deps), deps, sent, components }
}

const move = (id: string, x: number) => [{ kind: 'update', id, before: {}, after: { x } }] as const

describe('createCanvasSync', () => {
  it('sends coalesced edits in one batch and applies new versions', async () => {
    const { sync, sent, components } = setup(async () => ({
      revision: 2,
      versions: { a: 2, b: 2 },
    }))
    components.a!.x = 32
    sync.record([...move('a', 16)])
    sync.record([...move('a', 32)])
    sync.record([...move('b', 8)])
    expect(sync.status.value).toBe('pending')
    await sync.flush()
    expect(sent).toHaveLength(1)
    expect(sent[0]).toEqual([
      { op: 'component.update', id: 'a', version: 1, set: { x: 32 } },
      { op: 'component.update', id: 'b', version: 1, set: { x: 0 } },
    ])
    expect(components.a!.version).toBe(2)
    expect(sync.status.value).toBe('saved')
  })

  it('debounces before sending', async () => {
    vi.useFakeTimers()
    try {
      const { sync, sent } = setup(async () => ({ revision: 2, versions: {} }), 1000)
      sync.record([...move('a', 16)])
      await vi.advanceTimersByTimeAsync(900)
      expect(sent).toHaveLength(0)
      sync.record([...move('a', 32)])
      await vi.advanceTimersByTimeAsync(900)
      expect(sent).toHaveLength(0)
      await vi.advanceTimersByTimeAsync(200)
      expect(sent).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('goes offline on network errors, keeps the edits and retries', async () => {
    vi.useFakeTimers()
    try {
      let fail = true
      const { sync, sent } = setup(async () => {
        if (fail) throw new ApiError(0, 'NETWORK_ERROR', 'down')
        return { revision: 2, versions: { a: 2 } }
      })
      sync.record([...move('a', 16)])
      await vi.advanceTimersByTimeAsync(0)
      expect(sync.status.value).toBe('offline')
      expect(sync.hasPending('a')).toBe(true)

      fail = false
      await vi.advanceTimersByTimeAsync(1000) // first backoff
      expect(sent).toHaveLength(2)
      expect(sync.status.value).toBe('saved')
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports conflicts and waits for resolution', async () => {
    const conflict = new ApiError(409, 'VERSION_CONFLICT', 'conflict', undefined, {
      conflicts: [{ opIndex: 0, id: 'a', current: null }],
    })
    let reply: () => Promise<OpsResult> = () => Promise.reject(conflict)
    const { sync, deps, sent } = setup(() => reply())
    sync.record([...move('a', 16)])
    await sync.flush()
    expect(sync.status.value).toBe('conflict')
    expect(deps.onConflict).toHaveBeenCalledWith([{ opIndex: 0, id: 'a', current: null }])

    // New edits wait while the conflict is open.
    sync.record([...move('b', 8)])
    await sync.flush()
    expect(sent).toHaveLength(1)

    reply = async () => ({ revision: 3, versions: { a: 2, b: 2 } })
    sync.resolved()
    await sync.flush()
    expect(sent).toHaveLength(2)
    expect(sync.status.value).toBe('saved')
  })

  it('stops and reports when the server refuses the edits', async () => {
    const { sync, deps } = setup(() =>
      Promise.reject(new ApiError(403, 'FORBIDDEN', 'no', undefined, { deniedOps: [0] })),
    )
    sync.record([...move('a', 16)])
    await sync.flush()
    expect(sync.status.value).toBe('error')
    expect(deps.onRejected).toHaveBeenCalledOnce()
  })

  it('edits made while a batch is in flight go out next', async () => {
    let release: (() => void) | undefined
    const { sync, sent } = setup(
      (ops) =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              revision: 2,
              versions: Object.fromEntries(ops.map((o) => ['id' in o ? o.id : '', 2])),
            })
        }),
    )
    sync.record([...move('a', 16)])
    const first = sync.flush()
    await Promise.resolve()
    sync.record([...move('b', 8)])
    expect(sync.hasPending('a')).toBe(true) // in flight
    release?.()
    await vi.waitFor(() => expect(sent).toHaveLength(2))
    release?.()
    await first
    await sync.flush()
    expect(sent[1]).toEqual([{ op: 'component.update', id: 'b', version: 1, set: { x: 0 } }])
  })
})
