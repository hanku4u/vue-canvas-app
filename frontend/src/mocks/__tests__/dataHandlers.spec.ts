import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { api, ApiError } from '@/api/client'
import type { Dataset, ValuesResponse } from '@/api/types'
import { postQuery } from '@/data/query'
import { handlers } from '@/mocks/handlers'
import { clearQueryCache } from '@/mocks/handlers/data'

let upstreamCalls: URL[] = []

const upstream = [
  http.get('*/mock-data/spc/points', ({ request }) => {
    upstreamCalls.push(new URL(request.url))
    return HttpResponse.json({
      data: {
        items: [
          { ts: '2026-11-01T00:00:00Z', value: 40.1, tool_id: 'ET-03', chamber: 'C' },
          { ts: '2026-11-02T00:00:00Z', value: 41.5, tool_id: 'ET-03', chamber: 'C' },
        ],
      },
    })
  }),
  http.get('*/mock-data/tools', () =>
    HttpResponse.json({
      data: { items: [{ tool_id: 'ET-01' }, { tool_id: 'ET-03' }, { tool_id: 'LI-01' }] },
    }),
  ),
  http.get('*/mock-data/lots', () =>
    HttpResponse.json({ error: { code: 'RESULT_TOO_LARGE', message: 'too big' } }, { status: 413 }),
  ),
  http.get('*/mock-data/products', () => HttpResponse.json({ oops: true }, { status: 500 })),
]

const server = setupServer(...upstream, ...handlers)
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  upstreamCalls = []
  clearQueryCache()
})
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const spcParams = {
  parameter: 'CD_MEAN',
  tool: ['ET-03'],
  start: '2026-10-01T00:00:00Z',
  end: '2026-11-07T00:00:00Z',
  level: 'wafer',
}

async function errorOf(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(ApiError)
  return error as ApiError
}

describe('mock data endpoints', () => {
  it('lists datasets without upstream details', async () => {
    const { items } = await api.get<{ items: Dataset[] }>('/datasets')
    const spc = items.find((d) => d.id === 'spc_points')!
    expect(spc.suits).toContain('chart')
    expect(spc).not.toHaveProperty('request')
  })

  it('queries, maps params to the upstream API and shapes the result', async () => {
    const result = await postQuery({
      dataset: 'spc_points',
      params: spcParams,
      shape: { kind: 'raw', limit: 1 },
    })
    expect(upstreamCalls[0]?.searchParams.get('tool_ids')).toBe('ET-03')
    expect(upstreamCalls[0]?.searchParams.get('start')).toBe('2026-10-01T00:00:00.000Z')
    expect(result.data.value).toEqual([40.1])
    expect(result.meta).toMatchObject({
      rowsUpstream: 2,
      rowsReturned: 1,
      cacheHit: false,
      shape: 'raw',
    })
    expect(result.meta.requestId).toMatch(/^mock-/)
  })

  it('caches upstream results; refresh bypasses the cache', async () => {
    const request = {
      dataset: 'spc_points',
      params: spcParams,
      shape: { kind: 'raw' as const, limit: 5 },
    }
    await postQuery(request)
    const second = await postQuery({
      ...request,
      shape: { kind: 'distinct', column: 'chamber', limit: 5 },
    })
    expect(second.meta.cacheHit).toBe(true)
    expect(upstreamCalls).toHaveLength(1)
    const refreshed = await postQuery({ ...request, cache: 'refresh' })
    expect(refreshed.meta.cacheHit).toBe(false)
    expect(upstreamCalls).toHaveLength(2)
  })

  it('validates params', async () => {
    const missing = await errorOf(
      postQuery({
        dataset: 'spc_points',
        params: { level: 'wafer' },
        shape: { kind: 'raw', limit: 1 },
      }),
    )
    expect(missing).toMatchObject({ status: 400, code: 'INVALID_PARAMS' })
    expect(missing.message).toMatch(/parameter/)
    const badEnum = await errorOf(
      postQuery({
        dataset: 'spc_points',
        params: { ...spcParams, level: 'die' },
        shape: { kind: 'raw', limit: 1 },
      }),
    )
    expect(badEnum.message).toMatch(/wafer, site/)
  })

  it('maps upstream errors', async () => {
    const lotsParams = { start: '2026-10-01T00:00:00Z', end: '2026-11-07T00:00:00Z' }
    const tooLarge = await errorOf(
      postQuery({ dataset: 'lots', params: lotsParams, shape: { kind: 'raw', limit: 1 } }),
    )
    expect(tooLarge).toMatchObject({ status: 413, code: 'RESULT_TOO_LARGE' })
    const broken = await errorOf(
      postQuery({ dataset: 'product_list', params: {}, shape: { kind: 'raw', limit: 1 } }),
    )
    expect(broken).toMatchObject({ status: 502, code: 'UPSTREAM_ERROR' })
  })

  it('serves parameter values from the referenced dataset', async () => {
    const tools = await api.get<ValuesResponse>('/datasets/spc_points/values/tool?search=et')
    expect(tools).toEqual({ values: ['ET-01', 'ET-03'], truncated: false })
    const levels = await api.get<ValuesResponse>('/datasets/spc_points/values/level')
    expect(levels.values).toEqual(['wafer', 'site'])
  })
})
