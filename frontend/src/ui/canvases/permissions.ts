import type { CanvasRole } from '@/api/types'

/**
 * UI-side mirror of the canvas-level rules in docs/permissions.md ("Who can do what").
 * Only used to show or hide actions; the server enforces the real rules.
 */
export const canvasCan = {
  edit: (role: CanvasRole) => role === 'owner' || role === 'editor' || role === 'admin',
  manageAccess: (role: CanvasRole) => role === 'owner' || role === 'admin',
  delete: (role: CanvasRole) => role === 'owner' || role === 'admin',
  duplicate: (_role: CanvasRole) => true,
}

export const roleLabel: Record<CanvasRole, string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
  admin: 'Admin access',
}
