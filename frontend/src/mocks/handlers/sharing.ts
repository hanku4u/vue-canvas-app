import { http } from 'msw'
import type { AclEntry, ComponentAccessSettings, Share } from '@/api/types'
import { getDb, saveDb, userRef } from '../db'
import { apiError, ok } from '../http'
import { identify } from '../identity'
import { canManageAccess, canViewCanvas } from '../permissions'

/**
 * Users, canvas shares and per-component restrictions (docs/api.md, "Sharing and
 * restrictions"). Managing access is for the owner and admins.
 */

function readJson<T>(request: Request): Promise<T | null> {
  return request.json().then(
    (v) => v as T,
    () => null,
  )
}

function manageable(knoxId: string, canvasId: string) {
  const canvas = getDb().canvases[canvasId]
  if (!canvas || !canViewCanvas(knoxId, canvas)) {
    return { error: apiError(404, 'NOT_FOUND', 'Canvas not found') }
  }
  if (!canManageAccess(knoxId, canvas)) {
    return { error: apiError(403, 'FORBIDDEN', 'Only the owner or an admin can manage access') }
  }
  return { canvas }
}

function knownUser(knoxId: unknown): knoxId is string {
  return typeof knoxId === 'string' && !!getDb().users[knoxId]
}

export const sharingHandlers = [
  http.get('/api/users', ({ request }) => {
    if (!identify(request)) return apiError(401, 'UNAUTHENTICATED', 'Missing x-knox-id')
    const url = new URL(request.url)
    const search = (url.searchParams.get('search') ?? '').toLowerCase()
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 20) || 20, 100)
    const items = Object.values(getDb().users)
      .filter(
        (u) =>
          u.knoxId.toLowerCase().includes(search) || u.displayName.toLowerCase().includes(search),
      )
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
      .slice(0, limit)
      .map((u) => ({ knoxId: u.knoxId, displayName: u.displayName }))
    return ok({ items })
  }),

  http.get('/api/canvases/:id/shares', ({ request, params }) => {
    const user = identify(request)
    if (!user) return apiError(401, 'UNAUTHENTICATED', 'Missing x-knox-id')
    const { canvas, error } = manageable(user.knoxId, String(params.id))
    if (error) return error
    const shares: Share[] = getDb()
      .shares.filter((s) => s.canvasId === canvas.id)
      .map((s) => ({ knoxId: s.knoxId, role: s.role, displayName: userRef(s.knoxId).displayName }))
    return ok({ shares })
  }),

  http.put('/api/canvases/:id/shares', async ({ request, params }) => {
    const user = identify(request)
    if (!user) return apiError(401, 'UNAUTHENTICATED', 'Missing x-knox-id')
    const { canvas, error } = manageable(user.knoxId, String(params.id))
    if (error) return error
    const body = await readJson<{ shares?: Share[] }>(request)
    const shares = body?.shares
    if (
      !Array.isArray(shares) ||
      shares.some((s) => !knownUser(s.knoxId) || !['editor', 'viewer'].includes(s.role)) ||
      new Set(shares.map((s) => s.knoxId)).size !== shares.length
    ) {
      return apiError(
        400,
        'INVALID_PARAMS',
        'Shares must name known users once, as editor or viewer',
      )
    }
    const db = getDb()
    db.shares = [
      ...db.shares.filter((s) => s.canvasId !== canvas.id),
      ...shares
        .filter((s) => s.knoxId !== canvas.ownerId)
        .map((s) => ({ canvasId: canvas.id, knoxId: s.knoxId, role: s.role })),
    ]
    saveDb()
    return ok({
      shares: db.shares
        .filter((s) => s.canvasId === canvas.id)
        .map((s) => ({
          knoxId: s.knoxId,
          role: s.role,
          displayName: userRef(s.knoxId).displayName,
        })),
    })
  }),

  http.get('/api/canvases/:id/components/:cid/access', ({ request, params }) => {
    const user = identify(request)
    if (!user) return apiError(401, 'UNAUTHENTICATED', 'Missing x-knox-id')
    const { canvas, error } = manageable(user.knoxId, String(params.id))
    if (error) return error
    const component = getDb().components[String(params.cid)]
    if (!component || component.canvasId !== canvas.id) {
      return apiError(404, 'NOT_FOUND', 'Component not found')
    }
    const acl: AclEntry[] = getDb()
      .acl.filter((a) => a.componentId === component.id)
      .map((a) => ({
        knoxId: a.knoxId,
        access: a.access,
        displayName: userRef(a.knoxId).displayName,
      }))
    return ok<ComponentAccessSettings & { version: number }>({
      viewRestricted: component.viewRestricted,
      editRestricted: component.editRestricted,
      acl,
      version: component.version,
    })
  }),

  http.put('/api/canvases/:id/components/:cid/access', async ({ request, params }) => {
    const user = identify(request)
    if (!user) return apiError(401, 'UNAUTHENTICATED', 'Missing x-knox-id')
    const { canvas, error } = manageable(user.knoxId, String(params.id))
    if (error) return error
    const db = getDb()
    const component = db.components[String(params.cid)]
    if (!component || component.canvasId !== canvas.id) {
      return apiError(404, 'NOT_FOUND', 'Component not found')
    }
    const body = await readJson<ComponentAccessSettings>(request)
    if (
      !body ||
      typeof body.viewRestricted !== 'boolean' ||
      typeof body.editRestricted !== 'boolean' ||
      !Array.isArray(body.acl) ||
      body.acl.some((a) => !knownUser(a.knoxId) || !['view', 'edit'].includes(a.access)) ||
      new Set(body.acl.map((a) => a.knoxId)).size !== body.acl.length
    ) {
      return apiError(400, 'INVALID_PARAMS', 'Invalid access settings')
    }
    component.viewRestricted = body.viewRestricted
    component.editRestricted = body.editRestricted
    component.version += 1
    component.updatedBy = user.knoxId
    component.updatedAt = new Date().toISOString()
    db.acl = [
      ...db.acl.filter((a) => a.componentId !== component.id),
      ...body.acl.map((a) => ({ componentId: component.id, knoxId: a.knoxId, access: a.access })),
    ]
    canvas.revision += 1
    saveDb()
    return ok({ ...body, version: component.version })
  }),
]
