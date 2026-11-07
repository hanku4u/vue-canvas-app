/**
 * Development-only identity override.
 *
 * In production the gateway sets `x-knox-id`. In development (MSW mock or a local FastAPI
 * without a gateway) the dev user switcher stores a Knox ID here and the API client sends it.
 */

const STORAGE_KEY = 'dev.knoxId'

export const DEV_USERS = [
  { knoxId: 'j.doe', displayName: 'Jane Doe', note: 'admin' },
  { knoxId: 'k.lee', displayName: 'Kim Lee', note: 'engineer' },
  { knoxId: 'm.park', displayName: 'Min Park', note: 'engineer' },
  { knoxId: 's.choi', displayName: 'Sam Choi', note: 'new user' },
] as const

export const DEFAULT_DEV_KNOX_ID = 'j.doe'

export function getDevKnoxId(): string | null {
  if (!import.meta.env.DEV) return null
  try {
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_DEV_KNOX_ID
  } catch {
    return DEFAULT_DEV_KNOX_ID
  }
}

export function setDevKnoxId(knoxId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, knoxId)
  } catch {
    // Storage unavailable (private mode); the default user stays active.
  }
}
