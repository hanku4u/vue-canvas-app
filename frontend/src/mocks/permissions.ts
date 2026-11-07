/**
 * Effective-access rules from docs/permissions.md, implemented for the mock backend.
 * Keep in sync with the "Effective access" pseudo-code there.
 */
import type { CanvasRole } from '@/api/types'
import { getDb, isAdmin, type MockCanvas, type MockComponent } from './db'

/** The caller's share on a canvas (ignoring ownership and admin rights), if any. */
export function shareRole(knoxId: string, canvas: MockCanvas): 'editor' | 'viewer' | null {
  const share = getDb().shares.find((s) => s.canvasId === canvas.id && s.knoxId === knoxId)
  return share?.role ?? null
}

/**
 * Effective role: owner, then admin (admins can do everything, even where they also hold
 * a viewer share), then the share role.
 */
export function canvasRole(knoxId: string, canvas: MockCanvas): CanvasRole | null {
  if (canvas.ownerId === knoxId) return 'owner'
  if (isAdmin(knoxId)) return 'admin'
  return shareRole(knoxId, canvas)
}

function isOwnerOrAdmin(knoxId: string, canvas: MockCanvas): boolean {
  return isAdmin(knoxId) || canvas.ownerId === knoxId
}

export function canViewCanvas(knoxId: string, canvas: MockCanvas): boolean {
  return canvas.deletedAt === null && canvasRole(knoxId, canvas) !== null
}

export function canEditCanvas(knoxId: string, canvas: MockCanvas): boolean {
  if (canvas.deletedAt !== null) return false
  const role = canvasRole(knoxId, canvas)
  return role === 'owner' || role === 'editor' || role === 'admin'
}

export function canManageAccess(knoxId: string, canvas: MockCanvas): boolean {
  return canvas.deletedAt === null && isOwnerOrAdmin(knoxId, canvas)
}

function aclAccess(knoxId: string, component: MockComponent): 'view' | 'edit' | null {
  const entry = getDb().acl.find((a) => a.componentId === component.id && a.knoxId === knoxId)
  return entry?.access ?? null
}

export function canViewComponent(
  knoxId: string,
  canvas: MockCanvas,
  component: MockComponent,
): boolean {
  if (isOwnerOrAdmin(knoxId, canvas)) return true
  if (!canViewCanvas(knoxId, canvas)) return false
  return !component.viewRestricted || aclAccess(knoxId, component) !== null
}

export function canEditComponent(
  knoxId: string,
  canvas: MockCanvas,
  component: MockComponent,
): boolean {
  if (isOwnerOrAdmin(knoxId, canvas)) return true
  return (
    canvasRole(knoxId, canvas) === 'editor' &&
    canViewComponent(knoxId, canvas, component) &&
    (!component.editRestricted || aclAccess(knoxId, component) === 'edit')
  )
}
