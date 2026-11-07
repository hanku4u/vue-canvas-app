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
const DB_VERSION = 5

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

function seedPlaceholder(
  canvasId: string,
  title: string,
  x: number,
  y: number,
  zIndex: number,
  restrictions: Partial<Pick<MockComponent, 'viewRestricted' | 'editRestricted'>> = {},
): MockComponent {
  const ts = hoursAgo(2)
  return {
    id: `${canvasId}-p${zIndex + 1}`,
    canvasId,
    groupId: null,
    type: 'placeholder',
    title,
    x,
    y,
    w: 320,
    h: 208,
    zIndex,
    config: {},
    configVersion: 1,
    viewRestricted: false,
    editRestricted: false,
    ...restrictions,
    version: 1,
    createdBy: 'j.doe',
    updatedBy: 'j.doe',
    createdAt: ts,
    updatedAt: ts,
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
    // Stand-ins until real component types exist (F3+). The third one is edit-restricted
    // with an empty ACL: locked for editors (k.lee), still editable by the owner and admins.
    components: Object.fromEntries(
      [
        seedPlaceholder('c-et03-excursion', 'SPC – CD_MEAN (soon)', 0, 0, 0),
        seedPlaceholder('c-et03-excursion', 'Lot table (soon)', 352, 0, 1),
        seedPlaceholder('c-et03-excursion', 'Wafer maps (soon)', 0, 240, 2, {
          editRestricted: true,
        }),
        {
          ...seedPlaceholder('c-et03-excursion', 'Investigation notes', 352, 240, 3),
          type: 'note',
          config: {
            markdown: [
              '**Hypothesis:** gate CD on ET-03 chamber C drifted high ~10 days ago.',
              '',
              '- [x] SPC shows OOC points on chamber C',
              '- [ ] list affected lots',
              '- [ ] check wafer maps for an edge ring',
            ].join('\n'),
            color: 'yellow',
            fontSize: 'md',
          },
        },
      ].map((c) => [c.id, c]),
    ),
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
/** The serialized state we last loaded or saved, to notice writes from other tabs. */
let lastRaw: string | null = null

function parse(raw: string | null): MockDb | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as MockDb
    return parsed.version === DB_VERSION ? parsed : null
  } catch {
    return null // corrupt or old data: start fresh
  }
}

export function getDb(): MockDb {
  if (db) return db
  lastRaw = storage()?.getItem(STORAGE_KEY) ?? null
  db = parse(lastRaw) ?? seed()
  return db
}

/**
 * Pick up changes another tab saved, so several tabs act like clients of one server.
 * Called at the start of every request (see identify.ts).
 */
export function refreshDb(): void {
  const raw = storage()?.getItem(STORAGE_KEY) ?? null
  if (db && raw !== null && raw !== lastRaw) {
    db = parse(raw) ?? db
    lastRaw = raw
  }
}

export function saveDb(): void {
  if (!db) return
  lastRaw = JSON.stringify(db)
  storage()?.setItem(STORAGE_KEY, lastRaw)
}

/** Reset to the seed state (used by tests and the dev menu). */
export function resetDb(): void {
  db = seed()
  lastRaw = null
  storage()?.removeItem(STORAGE_KEY)
}

/**
 * Dev/test switch to make POST /ops fail: 'network' (connection error) or an HTTP status
 * such as '500'. Stored in localStorage under `mock.failOps`.
 */
export function opsFailureMode(): string | null {
  try {
    return storage()?.getItem('mock.failOps') ?? null
  } catch {
    return null
  }
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
