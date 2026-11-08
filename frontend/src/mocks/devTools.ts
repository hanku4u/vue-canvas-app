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

/**
 * Dev-only: create a benchmark canvas owned by `knoxId` (roadmap F13): 6 groups of 6 data
 * components (SPC charts, lot tables, wafer maps) and 100 notes. Returns the canvas id.
 */
export async function createBenchmarkCanvas(knoxId: string): Promise<string> {
  const [{ chartConfigSchema }, { tableConfigSchema }, { waferMapConfigSchema }, { newId }] =
    await Promise.all([
      import('@/components/chart/schema'),
      import('@/components/table/schema'),
      import('@/components/wafer-map/schema'),
      import('./db'),
    ])
  refreshDb()
  const db = getDb()
  const now = new Date().toISOString()
  const id = `c-bench-${newId().slice(0, 8)}`
  db.canvases[id] = {
    id,
    ownerId: knoxId,
    title: 'Benchmark: 36 data components, 100 notes',
    description: 'Generated for performance checks (F13).',
    defaultFilters: { time_range: { relative: 'last_30d' } },
    revision: 1,
    version: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
  const meta = { version: 1, createdBy: knoxId, updatedBy: knoxId, createdAt: now, updatedAt: now }
  const tools = ['ET-01', 'ET-02', 'ET-03', 'LI-01', 'CV-01', 'CP-01']
  let z = 0
  const W = 400
  const H = 280
  tools.forEach((tool, g) => {
    const groupId = newId()
    const gx = (g % 3) * (3 * (W + 16) + 64)
    const gy = Math.floor(g / 3) * (2 * (H + 16) + 120)
    db.groups[groupId] = {
      id: groupId,
      canvasId: id,
      title: `${tool} investigation`,
      x: gx,
      y: gy,
      w: 3 * (W + 16) + 32,
      h: 2 * (H + 16) + 72,
      zIndex: z++,
      collapsed: false,
      defaultFilters: { tool_id: [tool] },
      ...meta,
    }
    for (let i = 0; i < 6; i += 1) {
      const kind = i < 3 ? 'chart' : i < 5 ? 'table' : 'wafer-map'
      const config =
        kind === 'chart'
          ? chartConfigSchema.parse({ dataset: 'spc_points', kind: i === 0 ? 'spc' : 'line' })
          : kind === 'table'
            ? tableConfigSchema.parse({ dataset: 'lots' })
            : waferMapConfigSchema.parse({ dataset: 'wafer_dies', mode: 'stacked' })
      const cid = newId()
      db.components[cid] = {
        id: cid,
        canvasId: id,
        groupId,
        type: kind,
        title: `${tool} ${kind} ${i + 1}`,
        x: 16 + (i % 3) * (W + 16),
        y: 56 + Math.floor(i / 3) * (H + 16),
        w: W,
        h: H,
        zIndex: z++,
        config: config as Record<string, unknown>,
        configVersion: 1,
        viewRestricted: false,
        editRestricted: false,
        ...meta,
      }
    }
  })
  // 100 notes in a 10 × 10 block to the right.
  const nx = 3 * (3 * (W + 16) + 64) + 200
  for (let i = 0; i < 100; i += 1) {
    const cid = newId()
    db.components[cid] = {
      id: cid,
      canvasId: id,
      groupId: null,
      type: 'note',
      title: `Note ${i + 1}`,
      x: nx + (i % 10) * 256,
      y: Math.floor(i / 10) * 176,
      w: 240,
      h: 160,
      zIndex: z++,
      config: {
        markdown: `**Note ${i + 1}**\n\n- [x] measured\n- [ ] follow up`,
        color: 'yellow',
        fontSize: 'md',
      },
      configVersion: 1,
      viewRestricted: false,
      editRestricted: false,
      ...meta,
    }
  }
  saveDb()
  return id
}
