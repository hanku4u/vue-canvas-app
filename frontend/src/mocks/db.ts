/**
 * In-memory store behind the MSW mock of FastAPI, persisted to localStorage when available
 * so data survives page reloads. Shapes mirror the PostgreSQL tables in docs/architecture.md.
 */
import type { CanvasRole, FilterSet } from '@/api/types'

export interface MockUser {
  knoxId: string
  displayName: string
  firstSeen: string
  lastSeen: string
}

export interface MockCanvas {
  id: string
  ownerId: string
  title: string
  description: string
  defaultFilters: FilterSet
  revision: number
  version: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface MockShare {
  canvasId: string
  knoxId: string
  role: Exclude<CanvasRole, 'owner' | 'admin'>
}

export interface MockGroup {
  id: string
  canvasId: string
  title: string
  x: number
  y: number
  w: number
  h: number
  zIndex: number
  collapsed: boolean
  defaultFilters: FilterSet
  version: number
  updatedBy: string
  updatedAt: string
}

export interface MockComponent {
  id: string
  canvasId: string
  groupId: string | null
  type: string
  title: string
  x: number
  y: number
  w: number
  h: number
  zIndex: number
  config: Record<string, unknown>
  configVersion: number
  viewRestricted: boolean
  editRestricted: boolean
  version: number
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}

export interface MockAcl {
  componentId: string
  knoxId: string
  access: 'view' | 'edit'
}

export interface MockDb {
  version: number
  users: Record<string, MockUser>
  admins: string[]
  canvases: Record<string, MockCanvas>
  shares: MockShare[]
  groups: Record<string, MockGroup>
  components: Record<string, MockComponent>
  acl: MockAcl[]
}

const STORAGE_KEY = 'mock.db'
const DB_VERSION = 2

/** Always admins, mirroring BOOTSTRAP_ADMINS on the backend. */
export const BOOTSTRAP_ADMINS = ['j.doe']

const KNOWN_NAMES: Record<string, string> = {
  'j.doe': 'Jane Doe',
  'k.lee': 'Kim Lee',
  'm.park': 'Min Park',
  's.choi': 'Sam Choi',
}

export function newId(): string {
  return crypto.randomUUID()
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString()
}

function seedCanvas(
  id: string,
  ownerId: string,
  title: string,
  description: string,
  updatedHoursAgo: number,
): MockCanvas {
  const ts = hoursAgo(updatedHoursAgo)
  return {
    id,
    ownerId,
    title,
    description,
    defaultFilters: { time_range: { relative: 'last_7d' } },
    revision: 1,
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
  }
}

function seed(): MockDb {
  const now = new Date().toISOString()
  const users: Record<string, MockUser> = {}
  for (const [knoxId, displayName] of Object.entries(KNOWN_NAMES)) {
    users[knoxId] = { knoxId, displayName, firstSeen: now, lastSeen: now }
  }
  const canvases = [
    seedCanvas(
      'c-et03-excursion',
      'j.doe',
      'ET-03 CD excursion',
      'Gate CD running high on ET-03 chamber C. SPC, affected lots and wafer maps.',
      2,
    ),
    seedCanvas(
      'c-yield-review',
      'j.doe',
      'Weekly yield review',
      'Sort yield by product and test tool.',
      50,
    ),
    seedCanvas(
      'c-litho-weekly',
      'k.lee',
      'Litho weekly',
      'Overlay and CD trends across LI-01..03.',
      20,
    ),
    seedCanvas('c-cmp-monitor', 'm.park', 'CMP thickness monitor', '', 120),
  ]
  return {
    version: DB_VERSION,
    users,
    admins: [],
    canvases: Object.fromEntries(canvases.map((c) => [c.id, c])),
    shares: [
      { canvasId: 'c-et03-excursion', knoxId: 'k.lee', role: 'editor' },
      { canvasId: 'c-et03-excursion', knoxId: 'm.park', role: 'viewer' },
      { canvasId: 'c-litho-weekly', knoxId: 'j.doe', role: 'viewer' },
      { canvasId: 'c-cmp-monitor', knoxId: 'k.lee', role: 'editor' },
    ],
    groups: {},
    components: {},
    acl: [],
  }
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

export function userRef(knoxId: string): { knoxId: string; displayName: string } {
  return { knoxId, displayName: getDb().users[knoxId]?.displayName ?? knoxId }
}

export function isAdmin(knoxId: string): boolean {
  return BOOTSTRAP_ADMINS.includes(knoxId) || getDb().admins.includes(knoxId)
}
