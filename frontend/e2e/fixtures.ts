import type { APIRequestContext } from '@playwright/test'

const DATA_API = 'http://127.0.0.1:8001'

/**
 * A tested lot that ran on the planted excursion (ET-03 chamber C, docs/mock-data-api.md),
 * found through the mock data API: some of its wafers have the edge ring.
 */
export async function excursionLot(
  request: APIRequestContext,
): Promise<{ lot: string; ringWafers: string[] }> {
  const featured = (await (await request.get(`${DATA_API}/featured`)).json()).data.items[0]
  const spc = await request.get(`${DATA_API}/spc/points`, {
    params: {
      parameter: 'CD_MEAN',
      tool_ids: 'ET-03',
      start: featured.start,
      end: featured.end,
      level: 'wafer',
    },
  })
  const rows: { lot_id: string; chamber: string }[] = (await spc.json()).data.items
  const lots = [...new Set(rows.filter((r) => r.chamber === 'C').map((r) => r.lot_id))]
  for (let i = 0; i < lots.length; i += 50) {
    const wafers = await request.get(`${DATA_API}/wafers`, {
      params: { lot_ids: lots.slice(i, i + 50).join(',') },
    })
    const items: { lot_id: string; wafer_id: string; etch_chamber: string; tested: boolean }[] = (
      await wafers.json()
    ).data.items
    const tested = items.find((w) => w.tested && w.etch_chamber === 'C')
    if (tested) {
      const ringWafers = items
        .filter((w) => w.lot_id === tested.lot_id && w.etch_chamber === 'C')
        .map((w) => w.wafer_id)
      return { lot: tested.lot_id, ringWafers }
    }
  }
  throw new Error('No tested excursion lot found')
}
