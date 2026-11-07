/**
 * In-memory store behind the MSW mock of FastAPI, persisted to localStorage when available
 * so data survives page reloads. Later milestones add canvases, groups, components, shares
 * and ACLs here.
 */

export interface MockUser {
  knoxId: string
  displayName: string
  firstSeen: string
  lastSeen: string
}

export interface MockDb {
  version: number
  users: Record<string, MockUser>
  admins: string[]
}

const STORAGE_KEY = 'mock.db'
const DB_VERSION = 1

/** Always admins, mirroring BOOTSTRAP_ADMINS on the backend. */
export const BOOTSTRAP_ADMINS = ['j.doe']

const KNOWN_NAMES: Record<string, string> = {
  'j.doe': 'Jane Doe',
  'k.lee': 'Kim Lee',
  'm.park': 'Min Park',
  's.choi': 'Sam Choi',
}

function seed(): MockDb {
  return { version: DB_VERSION, users: {}, admins: [] }
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

let db: MockDb | null = null

export function getDb(): MockDb {
  if (db) return db
  const raw = storage()?.getItem(STORAGE_KEY)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as MockDb
      if (parsed.version === DB_VERSION) db = parsed
    } catch {
      // Corrupt or old data: start fresh.
    }
  }
  db ??= seed()
  return db
}

export function saveDb(): void {
  if (db) storage()?.setItem(STORAGE_KEY, JSON.stringify(db))
}

/** Reset to the seed state (used by tests and the dev menu). */
export function resetDb(): void {
  db = seed()
  storage()?.removeItem(STORAGE_KEY)
}

/** Record that a user was seen, like the backend's identity middleware does. */
export function touchUser(knoxId: string): MockUser {
  const store = getDb()
  const now = new Date().toISOString()
  const user = store.users[knoxId] ?? {
    knoxId,
    displayName: KNOWN_NAMES[knoxId] ?? knoxId,
    firstSeen: now,
    lastSeen: now,
  }
  user.lastSeen = now
  store.users[knoxId] = user
  saveDb()
  return user
}

export function isAdmin(knoxId: string): boolean {
  return BOOTSTRAP_ADMINS.includes(knoxId) || getDb().admins.includes(knoxId)
}
