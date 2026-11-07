import { http, type HttpResponseResolver } from 'msw'
import type {
  AdminCanvas,
  AdminEntry,
  AuditEntry,
  DatasetDetail,
  DatasetUsage,
  Health,
  UsageOverview,
  UsageRange,
  UserAccess,
} from '@/api/admin'
import { audit, BOOTSTRAP_ADMINS, getDb, isAdmin, saveDb, userRef, type MockUser } from '../db'
import { MOCK_DATASETS } from '../datasets'
import { apiError, noContent, ok } from '../http'
import { identify } from '../identity'
import { canViewCanvas, canViewComponent } from '../permissions'
import {
  datasetProfiles,
  errorEvents,
  hourly,
  inOutage,
  outageStart,
  RANGE_MS,
  slowQueries,
  USERS,
} from '../usage'

/**
 * Admin endpoints (docs/api.md#admin, docs/admin.md). Usage and health numbers are
 * fixtures (src/mocks/usage.ts) except the data API check, which really calls the local
 * mock data API. `localStorage['mock.adminFail'] = '<path fragment>'` makes matching admin
 * endpoints fail with 503, for error states.
 */

const STARTED_AT = new Date().toISOString()
const HOUR = 3_600_000

function failFor(path: string): boolean {
  try {
    const value = globalThis.localStorage?.getItem('mock.adminFail')
    return !!value && (value === '1' || path.includes(value))
  } catch {
    return false
  }
}

/** Wrap a resolver: admin only, plus the failure switch. */
function admin(
  resolver: (
    args: Parameters<HttpResponseResolver>[0] & { user: MockUser },
  ) => ReturnType<HttpResponseResolver>,
): HttpResponseResolver {
  return (args) => {
    const user = identify(args.request)
    if (!user) return apiError(401, 'UNAUTHENTICATED', 'Missing x-knox-id')
    if (!isAdmin(user.knoxId)) return apiError(403, 'ADMIN_REQUIRED', 'Admin rights required')
    if (failFor(new URL(args.request.url).pathname)) {
      return apiError(503, 'UNAVAILABLE', 'Usage store unavailable (simulated)')
    }
    return resolver({ ...args, user })
  }
}

function readJson<T>(request: Request): Promise<T | null> {
  return request.json().then(
    (v) => v as T,
    () => null,
  )
}

function range(request: Request): { range: UsageRange; from: number; to: number } {
  const value = new URL(request.url).searchParams.get('range')
  const r: UsageRange = value === '24h' || value === '30d' ? value : '7d'
  const to = Math.ceil(Date.now() / HOUR) * HOUR
  return { range: r, from: to - RANGE_MS[r], to }
}

// ---------------------------------------------------------------------------
// Usage aggregation
// ---------------------------------------------------------------------------

function datasetUsage(from: number, to: number): DatasetUsage[] {
  const buckets = hourly(from, to)
  const days = Math.max(1, (to - from) / (24 * HOUR))
  return datasetProfiles()
    .map((p) => {
      const calls = buckets.reduce((a, b) => a + (b.byDataset[p.id] ?? 0), 0)
      const errors = buckets.reduce(
        (a, b) => a + Math.round((b.byDataset[p.id] ?? 0) * (inOutage(b.t) ? 0.6 : p.errorRate)),
        0,
      )
      return {
        id: p.id,
        label: p.label,
        calls,
        users: Math.min(USERS.length * 5, Math.round(Math.sqrt(calls) * 0.6 + days)),
        cacheHitRate: p.cacheHit,
        p50Ms: p.p50,
        p95Ms: p.p95,
        errorRate: calls ? errors / calls : 0,
        avgUpstreamRows: p.upstreamRows,
        avgReturnedRows: p.returnedRows,
      }
    })
    .sort((a, b) => b.calls - a.calls)
}

function overview(from: number, to: number): UsageOverview {
  const db = getDb()
  const buckets = hourly(from, to)
  const datasets = datasetUsage(from, to)
  const queries = buckets.reduce((a, b) => a + b.queries, 0)
  const errors = buckets.reduce((a, b) => a + b.errors, 0)
  const weighted = (pick: (d: DatasetUsage) => number) =>
    queries ? datasets.reduce((a, d) => a + pick(d) * d.calls, 0) / queries : 0

  const daily = new Map<string, number>()
  for (const b of buckets) {
    const day = new Date(b.t).toISOString().slice(0, 10)
    daily.set(day, (daily.get(day) ?? 0) + b.users)
  }
  const dailyUsers = [...daily].map(([day, users]) => ({ day, users: Math.round(users * 0.3) }))

  const canvases = Object.values(db.canvases).filter((c) => !c.deletedAt)
  const topCanvases = canvases
    .map((c, i) => ({ id: c.id, title: c.title, queries: Math.round(queries * (0.4 / (i + 1))) }))
    .sort((a, b) => b.queries - a.queries)
    .slice(0, 5)

  const mix = new Map<string, number>()
  for (const c of Object.values(db.components)) mix.set(c.type, (mix.get(c.type) ?? 0) + 1)

  return {
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    tiles: {
      activeUsers:
        Math.max(0, ...dailyUsers.map((d) => d.users)) + Math.round(dailyUsers.length / 2),
      queries,
      cacheHitRate: weighted((d) => d.cacheHitRate),
      errorRate: queries ? errors / queries : 0,
      p95Ms: Math.round(weighted((d) => d.p95Ms)),
      canvasesCreated: Object.values(db.canvases).filter((c) => Date.parse(c.createdAt) >= from)
        .length,
    },
    hourly: buckets.map((b) => ({
      t: new Date(b.t).toISOString(),
      queries: b.queries,
      errors: b.errors,
    })),
    dailyUsers,
    topCanvases,
    componentMix: [...mix]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count),
  }
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

async function checkDataApi(): Promise<{ ok: boolean; latencyMs: number | null; message: string }> {
  const started = performance.now()
  try {
    const origin = globalThis.location?.origin ?? 'http://localhost'
    const response = await fetch(`${origin}/mock-data/health`, {
      signal: AbortSignal.timeout(3000),
    })
    const latencyMs = Math.round(performance.now() - started)
    return response.ok
      ? { ok: true, latencyMs, message: '' }
      : { ok: false, latencyMs, message: `Data API answered ${response.status}` }
  } catch (error) {
    return { ok: false, latencyMs: null, message: `Data API unreachable: ${String(error)}` }
  }
}

async function health(): Promise<Health> {
  const now = Date.now()
  const check = await checkDataApi()
  const outage = outageStart(now)
  // 24 h history at 1-minute resolution would be 1440 points; sample every 10 minutes.
  const history: Health['dataApi']['history'] = []
  for (let t = now - 24 * HOUR; t <= now; t += 10 * 60_000) {
    const down = t >= outage && t < outage + HOUR
    history.push({
      t: new Date(t).toISOString(),
      ok: !down,
      latencyMs: down ? null : Math.round(35 + 25 * Math.abs(Math.sin(t / 7_000_000))),
    })
  }
  history.push({ t: new Date(now).toISOString(), ok: check.ok, latencyMs: check.latencyMs })
  const lastFailure = check.ok
    ? {
        at: new Date(outage + 40 * 60_000).toISOString(),
        message: 'Data API unreachable: timed out after 30 s',
      }
    : { at: new Date(now).toISOString(), message: check.message }
  const status = check.ok
    ? check.latencyMs !== null && check.latencyMs > 1000
      ? 'degraded'
      : 'ok'
    : 'down'
  const entries = 412
  return {
    checkedAt: new Date(now).toISOString(),
    dataApi: {
      status,
      latencyMs: check.latencyMs,
      lastSuccess: check.ok
        ? new Date(now).toISOString()
        : new Date(outage + 2 * HOUR).toISOString(),
      lastFailure,
      history,
    },
    database: { status: 'ok', poolInUse: 3, poolSize: 20 },
    cache: {
      status: 'ok',
      entries,
      bytes: 187 * 1024 * 1024,
      maxBytes: 512 * 1024 * 1024,
      hitRate: 0.68,
      evictions: 1240,
    },
    concurrency: { status: 'ok', inFlight: 2, cap: 8, queued: 0 },
    app: {
      status: 'ok',
      version: '0.1.0-mock',
      commit: 'msw',
      startedAt: STARTED_AT,
      datasetsLoaded: MOCK_DATASETS.length,
      datasetLoadErrors: [],
    },
  }
}

// ---------------------------------------------------------------------------
// Access lookup
// ---------------------------------------------------------------------------

function userAccess(knoxId: string): UserAccess {
  const db = getDb()
  const live = Object.values(db.canvases).filter((c) => !c.deletedAt)
  const titleOf = (id: string) => db.canvases[id]?.title ?? id
  const accessible = live.filter((c) => canViewCanvas(knoxId, c) && c.ownerId !== knoxId)
  return {
    user: userRef(knoxId),
    isAdmin: isAdmin(knoxId),
    owned: live
      .filter((c) => c.ownerId === knoxId)
      .map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt })),
    shared: db.shares
      .filter(
        (s) =>
          s.knoxId === knoxId && db.canvases[s.canvasId] && !db.canvases[s.canvasId]!.deletedAt,
      )
      .map((s) => ({
        id: s.canvasId,
        title: titleOf(s.canvasId),
        role: s.role,
        owner: userRef(db.canvases[s.canvasId]!.ownerId),
      })),
    acl: db.acl
      .filter((a) => a.knoxId === knoxId && db.components[a.componentId])
      .map((a) => {
        const c = db.components[a.componentId]!
        return {
          canvasId: c.canvasId,
          canvasTitle: titleOf(c.canvasId),
          componentId: c.id,
          componentTitle: c.title,
          access: a.access,
        }
      }),
    hiddenFrom: accessible.flatMap((canvas) =>
      Object.values(db.components)
        .filter((c) => c.canvasId === canvas.id && !canViewComponent(knoxId, canvas, c))
        .map((c) => ({
          canvasId: canvas.id,
          canvasTitle: canvas.title,
          componentId: c.id,
          componentTitle: c.title,
        })),
    ),
  }
}

function knownUser(knoxId: unknown): knoxId is string {
  return typeof knoxId === 'string' && !!getDb().users[knoxId]
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const adminHandlers = [
  http.get(
    '/api/admin/admins',
    admin(() => {
      const db = getDb()
      const items: AdminEntry[] = [
        ...BOOTSTRAP_ADMINS.map((knoxId) => ({
          ...userRef(knoxId),
          source: 'config' as const,
          grantedBy: null,
          grantedAt: null,
        })),
        ...db.admins
          .filter((a) => !BOOTSTRAP_ADMINS.includes(a.knoxId))
          .map((a) => ({
            ...userRef(a.knoxId),
            source: 'db' as const,
            grantedBy: a.grantedBy,
            grantedAt: a.grantedAt,
          })),
      ]
      return ok({ items })
    }),
  ),

  http.post(
    '/api/admin/admins',
    admin(async ({ request, user }) => {
      const body = await readJson<{ knoxId?: string }>(request)
      const knoxId = body?.knoxId?.trim()
      if (!knownUser(knoxId)) return apiError(400, 'INVALID_PARAMS', 'Unknown user')
      if (isAdmin(knoxId)) return apiError(409, 'ALREADY_ADMIN', `${knoxId} is already an admin`)
      getDb().admins.push({ knoxId, grantedBy: user.knoxId, grantedAt: new Date().toISOString() })
      audit(user.knoxId, 'admin.grant', `user:${knoxId}`)
      saveDb()
      return ok({ knoxId }, 201)
    }),
  ),

  http.delete(
    '/api/admin/admins/:knoxId',
    admin(({ params, user }) => {
      const knoxId = String(params.knoxId)
      const db = getDb()
      if (BOOTSTRAP_ADMINS.includes(knoxId)) {
        return apiError(409, 'BOOTSTRAP_ADMIN', 'Admins from config can only be removed in config')
      }
      if (!db.admins.some((a) => a.knoxId === knoxId))
        return apiError(404, 'NOT_FOUND', 'Not an admin')
      const remaining = db.admins.filter((a) => a.knoxId !== knoxId)
      if (knoxId === user.knoxId && !remaining.length) {
        return apiError(409, 'LAST_ADMIN', 'You are the last admin granted here')
      }
      db.admins = remaining
      audit(user.knoxId, 'admin.revoke', `user:${knoxId}`)
      saveDb()
      return noContent()
    }),
  ),

  http.get(
    '/api/admin/canvases',
    admin(({ request }) => {
      const url = new URL(request.url)
      const search = (url.searchParams.get('search') ?? '').toLowerCase()
      const owner = url.searchParams.get('owner') ?? ''
      const deleted = url.searchParams.get('deleted') === 'true'
      const db = getDb()
      const items: AdminCanvas[] = Object.values(db.canvases)
        .filter((c) => (deleted ? true : !c.deletedAt))
        .filter((c) => !owner || c.ownerId === owner)
        .filter((c) => !search || c.title.toLowerCase().includes(search) || c.id.includes(search))
        .map((c) => {
          const components = Object.values(db.components).filter((x) => x.canvasId === c.id)
          return {
            id: c.id,
            title: c.title,
            owner: userRef(c.ownerId),
            shareCount: db.shares.filter((s) => s.canvasId === c.id).length,
            restrictedCount: components.filter((x) => x.viewRestricted || x.editRestricted).length,
            componentCount: components.length,
            updatedAt: c.updatedAt,
            deletedAt: c.deletedAt,
          }
        })
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      return ok({ items })
    }),
  ),

  http.post(
    '/api/admin/canvases/:id/transfer',
    admin(async ({ request, params, user }) => {
      const db = getDb()
      const canvas = db.canvases[String(params.id)]
      if (!canvas) return apiError(404, 'NOT_FOUND', 'Canvas not found')
      const body = await readJson<{ newOwner?: string; keepPreviousAsEditor?: boolean }>(request)
      const newOwner = body?.newOwner
      if (!knownUser(newOwner)) return apiError(400, 'INVALID_PARAMS', 'Unknown new owner')
      if (newOwner === canvas.ownerId) return apiError(400, 'INVALID_PARAMS', 'Already the owner')
      const previous = canvas.ownerId
      canvas.ownerId = newOwner
      canvas.version += 1
      db.shares = db.shares.filter(
        (s) => !(s.canvasId === canvas.id && (s.knoxId === newOwner || s.knoxId === previous)),
      )
      if (body?.keepPreviousAsEditor !== false) {
        db.shares.push({ canvasId: canvas.id, knoxId: previous, role: 'editor' })
      }
      audit(user.knoxId, 'canvas.transfer', `canvas:${canvas.id}`, {
        from: previous,
        to: newOwner,
        keepPreviousAsEditor: body?.keepPreviousAsEditor !== false,
      })
      saveDb()
      return ok({ id: canvas.id, owner: userRef(newOwner) })
    }),
  ),

  http.post(
    '/api/admin/canvases/:id/restore',
    admin(({ params, user }) => {
      const canvas = getDb().canvases[String(params.id)]
      if (!canvas) return apiError(404, 'NOT_FOUND', 'Canvas not found')
      if (!canvas.deletedAt) return apiError(409, 'NOT_DELETED', 'Canvas is not deleted')
      canvas.deletedAt = null
      audit(user.knoxId, 'canvas.restore', `canvas:${canvas.id}`, { title: canvas.title })
      saveDb()
      return ok({ id: canvas.id })
    }),
  ),

  http.get(
    '/api/admin/users/:knoxId/access',
    admin(({ params }) => {
      const knoxId = String(params.knoxId)
      if (!getDb().users[knoxId])
        return apiError(404, 'NOT_FOUND', `No user “${knoxId}” has used the app`)
      return ok(userAccess(knoxId))
    }),
  ),

  http.post(
    '/api/admin/users/:knoxId/revoke-shares',
    admin(({ params, user }) => {
      const knoxId = String(params.knoxId)
      const db = getDb()
      const removed = db.shares.filter((s) => s.knoxId === knoxId).length
      db.shares = db.shares.filter((s) => s.knoxId !== knoxId)
      audit(user.knoxId, 'user.revoke-shares', `user:${knoxId}`, { removed })
      saveDb()
      return ok({ removed })
    }),
  ),

  http.post(
    '/api/admin/users/:knoxId/transfer-all',
    admin(async ({ request, params, user }) => {
      const knoxId = String(params.knoxId)
      const body = await readJson<{ newOwner?: string }>(request)
      const newOwner = body?.newOwner
      if (!knownUser(newOwner) || newOwner === knoxId) {
        return apiError(400, 'INVALID_PARAMS', 'Pick another known user as the new owner')
      }
      const db = getDb()
      const owned = Object.values(db.canvases).filter((c) => c.ownerId === knoxId)
      for (const canvas of owned) {
        canvas.ownerId = newOwner
        canvas.version += 1
        db.shares = db.shares.filter((s) => !(s.canvasId === canvas.id && s.knoxId === newOwner))
      }
      audit(user.knoxId, 'user.transfer-all', `user:${knoxId}`, {
        to: newOwner,
        canvases: owned.map((c) => c.id),
      })
      saveDb()
      return ok({ transferred: owned.length })
    }),
  ),

  http.get(
    '/api/admin/usage/overview',
    admin(({ request }) => {
      const { from, to } = range(request)
      return ok(overview(from, to))
    }),
  ),

  http.get(
    '/api/admin/usage/datasets',
    admin(({ request }) => {
      const { from, to } = range(request)
      return ok({ items: datasetUsage(from, to) })
    }),
  ),

  http.get(
    '/api/admin/usage/datasets/:id',
    admin(({ request, params }) => {
      const { from, to } = range(request)
      const id = String(params.id)
      const dataset = datasetUsage(from, to).find((d) => d.id === id)
      if (!dataset) return apiError(404, 'NOT_FOUND', 'Unknown dataset')
      const profile = datasetProfiles().find((p) => p.id === id)!
      const buckets = hourly(from, to)
      const step = to - from > 7 * 24 * HOUR ? 6 * HOUR : HOUR
      const latency: DatasetDetail['latency'] = []
      for (let t = from; t < to; t += step) {
        const inStep = buckets.filter((b) => b.t >= t && b.t < t + step)
        const calls = inStep.reduce((a, b) => a + (b.byDataset[id] ?? 0), 0)
        const load = Math.min(1, calls / (step / HOUR) / 40)
        const slow = inStep.some((b) => inOutage(b.t))
        latency.push({
          t: new Date(t).toISOString(),
          calls,
          p50Ms: Math.round(profile.p50 * (0.8 + 0.5 * load)),
          p95Ms: Math.round(profile.p95 * (0.7 + 0.6 * load) * (slow ? 4 : 1)),
        })
      }
      const errors = errorEvents(from, to).filter((e) => e.dataset === id)
      const codes = new Map<string, number>()
      for (const e of errors) codes.set(e.code, (codes.get(e.code) ?? 0) + 1)
      const db = getDb()
      const usedBy = new Map<string, number>()
      for (const c of Object.values(db.components)) {
        if (
          c.config.dataset === id &&
          db.canvases[c.canvasId] &&
          !db.canvases[c.canvasId]!.deletedAt
        ) {
          usedBy.set(c.canvasId, (usedBy.get(c.canvasId) ?? 0) + 1)
        }
      }
      const detail: DatasetDetail = {
        dataset,
        latency,
        errorsByCode: [...codes]
          .map(([code, count]) => ({ code, count }))
          .sort((a, b) => b.count - a.count),
        slowest: slowQueries(from, to, 0)
          .filter((q) => q.dataset === id)
          .sort((a, b) => b.durationMs - a.durationMs)
          .slice(0, 10),
        canvases: [...usedBy].map(([cid, components]) => ({
          id: cid,
          title: db.canvases[cid]!.title,
          components,
        })),
      }
      return ok(detail)
    }),
  ),

  http.get(
    '/api/admin/usage/slow',
    admin(({ request }) => {
      const { from, to } = range(request)
      const threshold =
        Number(new URL(request.url).searchParams.get('thresholdMs') ?? 10_000) || 10_000
      return ok({ items: slowQueries(from, to, threshold).slice(0, 200) })
    }),
  ),

  http.get(
    '/api/admin/usage/errors',
    admin(({ request }) => {
      const { from, to } = range(request)
      const code = new URL(request.url).searchParams.get('code') ?? ''
      const all = errorEvents(from, to)
      const codes = new Map<string, number>()
      for (const e of all) codes.set(e.code, (codes.get(e.code) ?? 0) + 1)
      return ok({
        items: all.filter((e) => !code || e.code === code).slice(0, 200),
        codes: [...codes]
          .map(([c, count]) => ({ code: c, count }))
          .sort((a, b) => b.count - a.count),
      })
    }),
  ),

  http.get(
    '/api/admin/health',
    admin(async () => ok(await health())),
  ),

  http.get(
    '/api/admin/audit',
    admin(({ request }) => {
      const { from } = range(request)
      const url = new URL(request.url)
      const actor = url.searchParams.get('actor') ?? ''
      const action = url.searchParams.get('action') ?? ''
      const all = getDb().audit.filter((a) => Date.parse(a.ts) >= from)
      const items: AuditEntry[] = all
        .filter((a) => (!actor || a.actor === actor) && (!action || a.action === action))
        .map((a) => ({ ...a, actor: userRef(a.actor) }))
      return ok({ items, actions: [...new Set(getDb().audit.map((a) => a.action))].sort() })
    }),
  ),
]
