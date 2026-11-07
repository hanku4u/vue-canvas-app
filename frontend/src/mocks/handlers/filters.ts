import { http } from 'msw'
import type { FilterDimension, ValuesResponse } from '@/api/types'
import { findMockDataset } from '../datasets'
import { apiError, ok } from '../http'
import { identify } from '../identity'
import { shapeRows } from '../shaping'
import { errorResponse, fetchRows } from './data'

/**
 * GET /api/filters and GET /api/filters/{id}/values: the shared filter vocabulary
 * (backend/config/filters.yaml in the real backend, docs/data-layer.md#filters).
 */
interface MockDimension extends FilterDimension {
  values?: { dataset: string; column: string; params?: Record<string, unknown> } | string[]
}

const DIMENSIONS: MockDimension[] = [
  {
    id: 'time_range',
    label: 'Time range',
    type: 'time_range',
    hasValues: false,
    default: { relative: 'last_7d' },
  },
  {
    id: 'tool_id',
    label: 'Tool',
    type: 'string_list',
    hasValues: true,
    default: null,
    values: { dataset: 'tool_list', column: 'tool_id' },
  },
  {
    id: 'chamber',
    label: 'Chamber',
    type: 'string_list',
    hasValues: true,
    default: null,
    values: ['A', 'B', 'C', 'D'],
  },
  {
    id: 'lot_id',
    label: 'Lot',
    type: 'string_list',
    hasValues: true,
    default: null,
    // Lots released in the last 30 days (searchable by prefix).
    values: {
      dataset: 'lots',
      column: 'lot_id',
      params: { start: '-30d', end: 'now' },
    },
  },
  { id: 'wafer_id', label: 'Wafer', type: 'string_list', hasValues: false, default: null },
  {
    id: 'product',
    label: 'Product',
    type: 'string_list',
    hasValues: true,
    default: null,
    values: { dataset: 'product_list', column: 'product' },
  },
  {
    id: 'parameter',
    label: 'Parameter',
    type: 'string_list',
    hasValues: true,
    default: null,
    values: { dataset: 'spc_parameters', column: 'parameter' },
  },
]

function resolveRelative(value: unknown): unknown {
  if (value === 'now') return new Date().toISOString()
  const match = typeof value === 'string' ? /^-(\d+)d$/.exec(value) : null
  return match ? new Date(Date.now() - Number(match[1]) * 86_400_000).toISOString() : value
}

export const filterHandlers = [
  http.get('/api/filters', ({ request }) => {
    if (!identify(request)) return apiError(401, 'UNAUTHENTICATED', 'Missing x-knox-id')
    const items: FilterDimension[] = DIMENSIONS.map(({ values: _values, ...d }) => d)
    return ok({ items })
  }),

  http.get('/api/filters/:id/values', async ({ request, params }) => {
    if (!identify(request)) return apiError(401, 'UNAUTHENTICATED', 'Missing x-knox-id')
    const dimension = DIMENSIONS.find((d) => d.id === params.id)
    if (!dimension) return apiError(404, 'NOT_FOUND', 'Unknown filter dimension')
    const url = new URL(request.url)
    const search = (url.searchParams.get('search') ?? '').toLowerCase()
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50) || 50, 500)
    const source = dimension.values
    if (!source) return ok<ValuesResponse>({ values: [], truncated: false })
    if (Array.isArray(source)) {
      const values = source.filter((v) => v.toLowerCase().includes(search))
      return ok<ValuesResponse>({
        values: values.slice(0, limit),
        truncated: values.length > limit,
      })
    }
    const dataset = findMockDataset(source.dataset)
    if (!dataset) return ok<ValuesResponse>({ values: [], truncated: false })
    try {
      const sourceParams = Object.fromEntries(
        Object.entries(source.params ?? {}).map(([k, v]) => [k, resolveRelative(v)]),
      )
      const { entry } = await fetchRows(dataset, sourceParams, false)
      const shaped = shapeRows(entry.rows, [], {
        kind: 'distinct',
        column: source.column,
        search,
        limit: limit + 1,
      })
      const values = (shaped.data.value ?? []) as string[]
      return ok<ValuesResponse>({
        values: values.slice(0, limit),
        truncated: values.length > limit,
      })
    } catch (error) {
      return errorResponse(error)
    }
  }),
]
