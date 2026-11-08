import { resolveTime } from '@/data/params'
import { http } from 'msw'
import type { Dataset, QueryRequest, QueryResult, ValuesResponse } from '@/api/types'
import { findMockDataset, MOCK_DATASETS, publicDataset, type MockDataset } from '../datasets'
import { apiError, ok } from '../http'
import { identify } from '../identity'
import { shapeRows, type Row } from '../shaping'

/**
 * GET /api/datasets, GET /api/datasets/{id}/values/{param} and POST /api/query, backed by
 * the local mock data API (docs/mock-data-api.md) through the Vite proxy at /mock-data.
 * Mirrors the backend query pipeline (docs/data-layer.md): validate → cache → fetch →
 * shape → respond.
 */

const CACHE_TTL_MS = 5 * 60_000

interface CacheEntry {
  rows: Row[]
  fetchedAt: number
  upstreamMs: number
}

const cache = new Map<string, CacheEntry>()

/** Test helper. */
export function clearQueryCache(): void {
  cache.clear()
}

class QueryError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

function storageFlag(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

/** Validate params against the dataset and build the upstream query string. */
function upstreamQuery(dataset: MockDataset, params: Record<string, unknown>): URLSearchParams {
  const query = new URLSearchParams(dataset.request.fixed ?? {})
  const known = new Set(dataset.params.map((p) => p.name))
  for (const name of Object.keys(params)) {
    if (!known.has(name)) throw new QueryError(400, 'INVALID_PARAMS', `Unknown parameter '${name}'`)
  }
  for (const param of dataset.params) {
    const value = params[param.name]
    const empty =
      value === undefined ||
      value === null ||
      value === '' ||
      (Array.isArray(value) && value.length === 0)
    if (empty) {
      if (param.required) {
        throw new QueryError(400, 'INVALID_PARAMS', `Missing required parameter '${param.name}'`)
      }
      continue
    }
    const apiName = dataset.request.apiNames?.[param.name] ?? param.name
    const invalid = (what: string) =>
      new QueryError(400, 'INVALID_PARAMS', `Parameter '${param.name}' must be ${what}`)
    switch (param.type) {
      case 'string[]':
        if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
          throw invalid('a list of strings')
        }
        query.set(apiName, value.join(','))
        break
      case 'datetime':
      case 'date':
        if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw invalid('a date')
        query.set(apiName, new Date(value).toISOString())
        break
      case 'enum':
        if (!param.values?.includes(String(value))) {
          throw invalid(`one of ${param.values?.join(', ')}`)
        }
        query.set(apiName, String(value))
        break
      case 'int':
      case 'float':
        if (typeof value !== 'number' || !Number.isFinite(value)) throw invalid('a number')
        query.set(apiName, String(value))
        break
      case 'bool':
        if (typeof value !== 'boolean') throw invalid('true or false')
        query.set(apiName, String(value))
        break
      default:
        if (typeof value !== 'string') throw invalid('text')
        query.set(apiName, value)
    }
  }
  return query
}

// ---------------------------------------------------------------------------
// Upstream
// ---------------------------------------------------------------------------

export async function fetchRows(
  dataset: MockDataset,
  params: Record<string, unknown>,
  refresh: boolean,
): Promise<{ entry: CacheEntry; cacheHit: boolean }> {
  const query = upstreamQuery(dataset, params)
  const key = `${dataset.id}?${[...query.entries()]
    .sort()
    .map(([k, v]) => `${k}=${v}`)
    .join('&')}`
  const cached = cache.get(key)
  if (cached && !refresh && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { entry: cached, cacheHit: true }
  }

  // Dev/test switches, forwarded to the mock data API (docs/mock-data-api.md).
  const headers: Record<string, string> = {}
  const latency = storageFlag('mock.dataLatencyMs')
  const fail = storageFlag('mock.dataFail')
  if (latency) headers['x-mock-latency-ms'] = latency
  if (fail) headers['x-mock-fail'] = fail

  const origin = globalThis.location?.origin ?? 'http://localhost'
  const url = new URL(`/mock-data${dataset.request.path}?${query}`, origin)
  const started = Date.now()
  let response: Response
  try {
    response = await fetch(url, { headers })
  } catch {
    throw new QueryError(502, 'UPSTREAM_ERROR', 'The data API could not be reached')
  }
  const upstreamMs = Date.now() - started
  const body = (await response.json().catch(() => null)) as {
    data?: { items?: Row[] }
    error?: { code?: string; message?: string }
  } | null
  if (!response.ok) {
    const message = body?.error?.message ?? `Data API returned ${response.status}`
    if (response.status === 413) throw new QueryError(413, 'RESULT_TOO_LARGE', message)
    if (response.status === 400) throw new QueryError(400, 'INVALID_PARAMS', message)
    throw new QueryError(502, 'UPSTREAM_ERROR', message)
  }
  if (!Array.isArray(body?.data?.items)) {
    throw new QueryError(502, 'UPSTREAM_BAD_RESPONSE', 'Unexpected response from the data API')
  }
  const entry = { rows: body.data.items, fetchedAt: Date.now(), upstreamMs }
  cache.set(key, entry)
  return { entry, cacheHit: false }
}

export function errorResponse(error: unknown) {
  if (error instanceof QueryError) return apiError(error.status, error.code, error.message)
  return apiError(500, 'INTERNAL', String(error))
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const dataHandlers = [
  http.get('/api/datasets', ({ request }) => {
    if (!identify(request)) return apiError(401, 'UNAUTHENTICATED', 'Missing x-knox-id')
    return ok<{ items: Dataset[] }>({ items: MOCK_DATASETS.map(publicDataset) })
  }),

  http.get('/api/datasets/:id/values/:param', async ({ request, params }) => {
    if (!identify(request)) return apiError(401, 'UNAUTHENTICATED', 'Missing x-knox-id')
    const dataset = findMockDataset(String(params.id))
    const param = dataset?.params.find((p) => p.name === params.param)
    if (!dataset || !param) return apiError(404, 'NOT_FOUND', 'Unknown dataset or parameter')
    const url = new URL(request.url)
    const search = url.searchParams.get('search') ?? ''
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50) || 50, 500)
    if (param.values) {
      const values = param.values.filter((v) => v.toLowerCase().includes(search.toLowerCase()))
      return ok<ValuesResponse>({
        values: values.slice(0, limit),
        truncated: values.length > limit,
      })
    }
    const source = param.valuesFrom && findMockDataset(param.valuesFrom.dataset)
    if (!source || !param.valuesFrom) return ok<ValuesResponse>({ values: [], truncated: false })
    try {
      const fixed = Object.fromEntries(
        Object.entries(param.valuesFrom.params ?? {}).map(([k, v]) => [
          k,
          typeof v === 'string' ? resolveTime(v) : v,
        ]),
      )
      const { entry } = await fetchRows(source, fixed, false)
      const shaped = shapeRows(entry.rows, [], {
        kind: 'distinct',
        column: param.valuesFrom.column,
        search,
        limit: param.valuesFrom.order === 'desc' ? 100_000 : limit + 1,
      })
      let values = (shaped.data.value ?? []) as string[]
      if (param.valuesFrom.order === 'desc') values = values.reverse()
      return ok<ValuesResponse>({
        values: values.slice(0, limit),
        truncated: values.length > limit,
      })
    } catch (error) {
      return errorResponse(error)
    }
  }),

  http.post('/api/query', async ({ request }) => {
    if (!identify(request)) return apiError(401, 'UNAUTHENTICATED', 'Missing x-knox-id')
    const started = Date.now()
    const body = (await request.json().catch(() => null)) as QueryRequest | null
    if (!body?.dataset || !body.shape?.kind) {
      return apiError(400, 'INVALID_PARAMS', 'dataset and shape are required')
    }
    const dataset = findMockDataset(body.dataset)
    if (!dataset) return apiError(404, 'NOT_FOUND', `Unknown dataset '${body.dataset}'`)
    try {
      const { entry, cacheHit } = await fetchRows(
        dataset,
        body.params ?? {},
        body.cache === 'refresh',
      )
      const shaped = shapeRows(entry.rows, dataset.columns, body.shape)
      const rowsReturned = Object.values(shaped.data)[0]?.length ?? 0
      const result: QueryResult = {
        columns: shaped.columns,
        data: shaped.data,
        meta: {
          ...shaped.meta,
          shape: body.shape.kind,
          rowsUpstream: entry.rows.length,
          rowsReturned,
          cacheHit,
          asOf: new Date(entry.fetchedAt).toISOString(),
          durationMs: Date.now() - started,
          upstreamMs: cacheHit ? 0 : entry.upstreamMs,
        },
      }
      return ok(result)
    } catch (error) {
      return errorResponse(error)
    }
  }),
]
