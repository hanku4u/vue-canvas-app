import { DEFAULT_DEV_KNOX_ID } from '@/api/devIdentity'
import { touchUser, type MockUser } from './db'

/**
 * Resolve the caller like the backend's identity middleware: read `x-knox-id`,
 * upsert the user. Returns null when the header is present but empty (→ 401).
 */
export function identify(request: Request): MockUser | null {
  const header = request.headers.get('x-knox-id')
  const knoxId = header === null ? DEFAULT_DEV_KNOX_ID : header.trim()
  return knoxId ? touchUser(knoxId) : null
}
