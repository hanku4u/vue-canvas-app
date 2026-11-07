import { getDb, refreshDb, saveDb } from './db'

/**
 * Dev-only: pretend another user (k.lee) edited the canvas on the server, by moving the
 * first saved component 64px right and bumping its version. Returns its title, or null if
 * the canvas has no saved components.
 */
export function simulateRemoteEdit(canvasId: string): string | null {
  refreshDb()
  const db = getDb()
  const target = Object.values(db.components)
    .filter((c) => c.canvasId === canvasId)
    .sort((a, b) => a.zIndex - b.zIndex)[0]
  if (!target) return null
  target.x += 64
  target.version += 1
  target.updatedBy = 'k.lee'
  target.updatedAt = new Date().toISOString()
  saveDb()
  return target.title
}
