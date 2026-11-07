import { http, HttpResponse } from 'msw'
import type {
  Canvas,
  CanvasComponent,
  CanvasGroup,
  CanvasListScope,
  CanvasOp,
  CanvasSummary,
  CreateCanvasRequest,
  DuplicateCanvasRequest,
  OpsRequest,
  OpsResult,
  Page,
} from '@/api/types'
import {
  getDb,
  isAdmin,
  newId,
  opsFailureMode,
  saveDb,
  userRef,
  type MockCanvas,
  type MockComponent,
  type MockGroup,
} from '../db'
import { apiError, noContent, ok } from '../http'
import { identify } from '../identity'
import {
  canEditCanvas,
  canEditComponent,
  canManageAccess,
  canvasRole,
  canViewCanvas,
  canViewComponent,
  shareRole,
} from '../permissions'

const MAX_TITLE = 120
const MAX_DESCRIPTION = 1000

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

function visibleComponents(knoxId: string, canvas: MockCanvas): MockComponent[] {
  return Object.values(getDb().components).filter(
    (c) => c.canvasId === canvas.id && canViewComponent(knoxId, canvas, c),
  )
}

function toSummary(knoxId: string, canvas: MockCanvas): CanvasSummary {
  return {
    id: canvas.id,
    title: canvas.title,
    description: canvas.description,
    owner: userRef(canvas.ownerId),
    role: canvasRole(knoxId, canvas) ?? 'viewer',
    componentCount: visibleComponents(knoxId, canvas).length,
    version: canvas.version,
    updatedAt: canvas.updatedAt,
  }
}

function toGroup(group: MockGroup): CanvasGroup {
  const { id, title, x, y, w, h, zIndex, collapsed, defaultFilters, version } = group
  return { id, title, x, y, w, h, zIndex, collapsed, defaultFilters, version }
}

function toComponent(knoxId: string, canvas: MockCanvas, c: MockComponent): CanvasComponent {
  return {
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
    version: c.version,
    access: {
      canEdit: canEditComponent(knoxId, canvas, c),
      viewRestricted: c.viewRestricted,
      editRestricted: c.editRestricted,
    },
    updatedBy: c.updatedBy,
    updatedAt: c.updatedAt,
  }
}

function toCanvas(knoxId: string, canvas: MockCanvas): Canvas {
  return {
    id: canvas.id,
    title: canvas.title,
    description: canvas.description,
    owner: userRef(canvas.ownerId),
    role: canvasRole(knoxId, canvas) ?? 'viewer',
    canManageAccess: canManageAccess(knoxId, canvas),
    version: canvas.version,
    revision: canvas.revision,
    defaultFilters: canvas.defaultFilters,
    groups: Object.values(getDb().groups)
      .filter((g) => g.canvasId === canvas.id)
      .map(toGroup),
    components: visibleComponents(knoxId, canvas).map((c) => toComponent(knoxId, canvas, c)),
    updatedAt: canvas.updatedAt,
  }
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const title = value.trim()
  return title.length > 0 && title.length <= MAX_TITLE ? title : null
}

function validDescription(value: unknown): string | null {
  if (value === undefined) return ''
  if (typeof value !== 'string' || value.length > MAX_DESCRIPTION) return null
  return value.trim()
}

/** Find a canvas the caller can view; otherwise null (→ 404, never 403, per permissions.md). */
function findViewable(knoxId: string, id: string): MockCanvas | null {
  const canvas = getDb().canvases[id]
  return canvas && canViewCanvas(knoxId, canvas) ? canvas : null
}

function readJson<T>(request: Request): Promise<T | null> {
  return request.json().then(
    (body) => body as T,
    () => null,
  )
}

// ---------------------------------------------------------------------------
// Ops
// ---------------------------------------------------------------------------

type OpOutcome =
  | { kind: 'ok'; apply: () => [id: string, version: number] | void }
  | { kind: 'conflict'; id: string; current: unknown }
  | { kind: 'denied' }
  | { kind: 'invalid'; message: string }

const EDITABLE_COMPONENT_FIELDS = new Set([
  'title',
  'groupId',
  'x',
  'y',
  'w',
  'h',
  'zIndex',
  'config',
  'configVersion',
])

/** Validate editable component fields; returns an error message or null. */
function invalidComponentFields(fields: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(fields)) {
    if (!EDITABLE_COMPONENT_FIELDS.has(key)) return `Field '${key}' cannot be set`
    if (['x', 'y', 'w', 'h', 'zIndex', 'configVersion'].includes(key)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return `'${key}' must be a number`
    }
    if ((key === 'w' || key === 'h') && (value as number) <= 0) return `'${key}' must be positive`
    if (key === 'title' && validTitle(value) === null) return 'Invalid title'
    if (key === 'config' && (typeof value !== 'object' || value === null || Array.isArray(value))) {
      return "'config' must be an object"
    }
    if (key === 'groupId' && value !== null && typeof value !== 'string') return 'Invalid groupId'
  }
  return null
}

/**
 * The component an op refers to, if it exists on this canvas and the caller can see it.
 * Anything else is reported as a conflict with `current: null` ("it's gone"), so the
 * client can drop or re-create it (docs/api.md).
 */
function targetComponent(knoxId: string, canvas: MockCanvas, id: string): MockComponent | null {
  const component = getDb().components[id]
  return component &&
    component.canvasId === canvas.id &&
    canViewComponent(knoxId, canvas, component)
    ? component
    : null
}

function checkOp(knoxId: string, canvas: MockCanvas, op: CanvasOp, now: string): OpOutcome {
  switch (op.op) {
    case 'canvas.update': {
      if (!canEditCanvas(knoxId, canvas)) return { kind: 'denied' }
      if (op.version !== canvas.version) {
        return { kind: 'conflict', id: 'canvas', current: toSummary(knoxId, canvas) }
      }
      const { title, description, defaultFilters } = op.set ?? {}
      const nextTitle = title === undefined ? canvas.title : validTitle(title)
      const nextDescription =
        description === undefined ? canvas.description : validDescription(description)
      if (nextTitle === null) return { kind: 'invalid', message: 'Invalid title' }
      if (nextDescription === null) return { kind: 'invalid', message: 'Invalid description' }
      return {
        kind: 'ok',
        apply: () => {
          canvas.title = nextTitle
          canvas.description = nextDescription
          if (defaultFilters !== undefined) canvas.defaultFilters = defaultFilters
          canvas.version += 1
          canvas.updatedAt = now
          return ['canvas', canvas.version]
        },
      }
    }
    case 'component.create': {
      if (!canEditCanvas(knoxId, canvas)) return { kind: 'denied' }
      const { id, type, ...fields } = op.component ?? ({} as typeof op.component)
      if (typeof id !== 'string' || !id || typeof type !== 'string' || !type) {
        return { kind: 'invalid', message: 'component.create needs an id and a type' }
      }
      if (getDb().components[id])
        return { kind: 'invalid', message: `Component ${id} already exists` }
      const problem = invalidComponentFields(fields)
      if (problem) return { kind: 'invalid', message: problem }
      return {
        kind: 'ok',
        apply: () => {
          getDb().components[id] = {
            id,
            canvasId: canvas.id,
            type,
            title: fields.title,
            groupId: fields.groupId ?? null,
            x: fields.x,
            y: fields.y,
            w: fields.w,
            h: fields.h,
            zIndex: fields.zIndex,
            config: fields.config ?? {},
            configVersion: fields.configVersion ?? 1,
            viewRestricted: false,
            editRestricted: false,
            version: 1,
            createdBy: knoxId,
            updatedBy: knoxId,
            createdAt: now,
            updatedAt: now,
          }
          return [id, 1]
        },
      }
    }
    case 'component.update': {
      const component = targetComponent(knoxId, canvas, op.id)
      if (!component) return { kind: 'conflict', id: op.id, current: null }
      if (!canEditComponent(knoxId, canvas, component)) return { kind: 'denied' }
      if (op.version !== component.version) {
        return { kind: 'conflict', id: op.id, current: toComponent(knoxId, canvas, component) }
      }
      const problem = invalidComponentFields(op.set ?? {})
      if (problem) return { kind: 'invalid', message: problem }
      return {
        kind: 'ok',
        apply: () => {
          Object.assign(component, op.set)
          component.version += 1
          component.updatedBy = knoxId
          component.updatedAt = now
          return [component.id, component.version]
        },
      }
    }
    case 'component.delete': {
      const component = targetComponent(knoxId, canvas, op.id)
      if (!component) return { kind: 'conflict', id: op.id, current: null }
      if (!canEditComponent(knoxId, canvas, component)) return { kind: 'denied' }
      if (op.version !== component.version) {
        return { kind: 'conflict', id: op.id, current: toComponent(knoxId, canvas, component) }
      }
      return {
        kind: 'ok',
        apply: () => {
          const db = getDb()
          delete db.components[component.id]
          db.acl = db.acl.filter((a) => a.componentId !== component.id)
        },
      }
    }
    default:
      // Group ops arrive with groups (roadmap F5).
      return { kind: 'invalid', message: `Op '${op.op}' is not supported by the mock yet` }
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const canvasHandlers = [
  http.get('/api/canvases', ({ request }) => {
    const user = identify(request)
    if (!user) return apiError(401, 'UNAUTHENTICATED', 'Missing x-knox-id')
    const url = new URL(request.url)
    const scope = (url.searchParams.get('scope') ?? 'mine') as CanvasListScope
    const search = (url.searchParams.get('search') ?? '').trim().toLowerCase()
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50) || 50, 200)
    const offset = Number(url.searchParams.get('cursor') ?? 0) || 0

    if (!['mine', 'shared', 'all'].includes(scope)) {
      return apiError(400, 'INVALID_PARAMS', `Unknown scope '${scope}'`)
    }
    if (scope === 'all' && !isAdmin(user.knoxId)) {
      return apiError(403, 'ADMIN_REQUIRED', 'Admin rights required')
    }

    const matches = Object.values(getDb().canvases)
      .filter((c) => c.deletedAt === null)
      .filter((c) => {
        if (scope === 'mine') return c.ownerId === user.knoxId
        if (scope === 'shared') return c.ownerId !== user.knoxId && !!shareRole(user.knoxId, c)
        return true
      })
      .filter(
        (c) =>
          !search ||
          c.title.toLowerCase().includes(search) ||
          c.description.toLowerCase().includes(search),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

    const items = matches.slice(offset, offset + limit).map((c) => toSummary(user.knoxId, c))
    const nextCursor = offset + limit < matches.length ? String(offset + limit) : null
    return ok<Page<CanvasSummary>>({ items, nextCursor })
  }),

  http.post('/api/canvases', async ({ request }) => {
    const user = identify(request)
    if (!user) return apiError(401, 'UNAUTHENTICATED', 'Missing x-knox-id')
    const body = await readJson<CreateCanvasRequest>(request)
    const title = validTitle(body?.title)
    const description = validDescription(body?.description)
    if (title === null) {
      return apiError(400, 'INVALID_PARAMS', `Title is required (max ${MAX_TITLE} characters)`)
    }
    if (description === null) {
      return apiError(
        400,
        'INVALID_PARAMS',
        `Description is limited to ${MAX_DESCRIPTION} characters`,
      )
    }
    const now = new Date().toISOString()
    const canvas: MockCanvas = {
      id: newId(),
      ownerId: user.knoxId,
      title,
      description,
      defaultFilters: { time_range: { relative: 'last_7d' } },
      revision: 0,
      version: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    getDb().canvases[canvas.id] = canvas
    saveDb()
    return ok<Canvas>(toCanvas(user.knoxId, canvas), 201)
  }),

  http.get('/api/canvases/:id', ({ request, params }) => {
    const user = identify(request)
    if (!user) return apiError(401, 'UNAUTHENTICATED', 'Missing x-knox-id')
    const canvas = findViewable(user.knoxId, String(params.id))
    if (!canvas) return apiError(404, 'NOT_FOUND', 'Canvas not found')
    return ok<Canvas>(toCanvas(user.knoxId, canvas))
  }),

  http.post('/api/canvases/:id/ops', async ({ request, params }) => {
    const user = identify(request)
    if (!user) return apiError(401, 'UNAUTHENTICATED', 'Missing x-knox-id')
    const failure = opsFailureMode()
    if (failure === 'network') return HttpResponse.error()
    if (failure && /^\d{3}$/.test(failure)) {
      return apiError(Number(failure), 'SIMULATED_FAILURE', 'Simulated failure (mock.failOps)')
    }
    const canvas = findViewable(user.knoxId, String(params.id))
    if (!canvas) return apiError(404, 'NOT_FOUND', 'Canvas not found')
    const body = await readJson<OpsRequest>(request)
    if (!body || !Array.isArray(body.ops) || body.ops.length === 0) {
      return apiError(400, 'INVALID_OP', 'Body must contain a non-empty ops array')
    }

    const now = new Date().toISOString()
    const outcomes = body.ops.map((op) => checkOp(user.knoxId, canvas, op, now))

    const invalid = outcomes.findIndex((o) => o.kind === 'invalid')
    if (invalid >= 0) {
      const outcome = outcomes[invalid] as { message: string }
      return apiError(400, 'INVALID_OP', outcome.message, { opIndex: invalid })
    }
    const denied = outcomes.flatMap((o, i) => (o.kind === 'denied' ? [i] : []))
    if (denied.length) {
      return apiError(403, 'FORBIDDEN', 'Not allowed to apply these ops', { deniedOps: denied })
    }
    const conflicts = outcomes.flatMap((o, i) =>
      o.kind === 'conflict' ? [{ opIndex: i, id: o.id, current: o.current }] : [],
    )
    if (conflicts.length) {
      return apiError(409, 'VERSION_CONFLICT', 'Changed by someone else', { conflicts })
    }

    const versions: Record<string, number> = {}
    for (const outcome of outcomes) {
      if (outcome.kind !== 'ok') continue
      const entry = outcome.apply()
      if (entry) versions[entry[0]] = entry[1]
    }
    canvas.revision += 1
    canvas.updatedAt = now
    saveDb()
    return ok<OpsResult>({ revision: canvas.revision, versions })
  }),

  http.delete('/api/canvases/:id', ({ request, params }) => {
    const user = identify(request)
    if (!user) return apiError(401, 'UNAUTHENTICATED', 'Missing x-knox-id')
    const canvas = findViewable(user.knoxId, String(params.id))
    if (!canvas) return apiError(404, 'NOT_FOUND', 'Canvas not found')
    if (!canManageAccess(user.knoxId, canvas)) {
      return apiError(403, 'FORBIDDEN', 'Only the owner or an admin can delete this canvas')
    }
    canvas.deletedAt = new Date().toISOString()
    saveDb()
    return noContent()
  }),

  http.post('/api/canvases/:id/duplicate', async ({ request, params }) => {
    const user = identify(request)
    if (!user) return apiError(401, 'UNAUTHENTICATED', 'Missing x-knox-id')
    const source = findViewable(user.knoxId, String(params.id))
    if (!source) return apiError(404, 'NOT_FOUND', 'Canvas not found')
    const body = await readJson<DuplicateCanvasRequest>(request)
    const title = validTitle(body?.title ?? `Copy of ${source.title}`)
    if (title === null) {
      return apiError(400, 'INVALID_PARAMS', `Title is required (max ${MAX_TITLE} characters)`)
    }

    const db = getDb()
    const now = new Date().toISOString()
    const copy: MockCanvas = {
      ...source,
      id: newId(),
      ownerId: user.knoxId,
      title,
      revision: 0,
      version: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    db.canvases[copy.id] = copy

    // Copy groups, then only the components the caller can see, without restrictions.
    const groupIds = new Map<string, string>()
    for (const group of Object.values(db.groups).filter((g) => g.canvasId === source.id)) {
      const id = newId()
      groupIds.set(group.id, id)
      db.groups[id] = { ...group, id, canvasId: copy.id, version: 1, updatedBy: user.knoxId }
    }
    for (const component of visibleComponents(user.knoxId, source)) {
      const id = newId()
      db.components[id] = {
        ...component,
        id,
        canvasId: copy.id,
        groupId: component.groupId ? (groupIds.get(component.groupId) ?? null) : null,
        viewRestricted: false,
        editRestricted: false,
        version: 1,
        createdBy: user.knoxId,
        updatedBy: user.knoxId,
        createdAt: now,
        updatedAt: now,
      }
    }
    saveDb()
    return ok<Canvas>(toCanvas(user.knoxId, copy), 201)
  }),
]
