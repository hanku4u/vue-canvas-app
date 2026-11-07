import { describe, expect, it } from 'vitest'
import type { Dataset, FilterDimension } from '@/api/types'
import { paramsFromFilters } from '@/filters/bindings'
import { resolveFilters, type ResolveInput, type SessionFilters } from '@/filters/resolve'
import {
  decodeFilter,
  describeFilter,
  encodeFilter,
  isEmptyFilter,
  splitPasted,
  timeRangeParams,
} from '@/filters/values'

const dims: FilterDimension[] = [
  {
    id: 'time_range',
    label: 'Time range',
    type: 'time_range',
    hasValues: false,
    default: { relative: 'last_7d' },
  },
  { id: 'tool_id', label: 'Tool', type: 'string_list', hasValues: true, default: null },
  { id: 'lot_id', label: 'Lot', type: 'string_list', hasValues: true, default: null },
]

const empty: SessionFilters = { canvas: {}, groups: {} }

describe('resolveFilters', () => {
  it('falls back to the dimension default', () => {
    const r = resolveFilters({ dimensions: dims, session: empty, canvasDefaults: {} })
    expect(r.time_range).toEqual({ value: { relative: 'last_7d' }, level: 'dimension' })
    expect(r.tool_id).toBeUndefined()
  })

  it('applies the documented precedence, level by level', () => {
    const full: ResolveInput = {
      dimensions: dims,
      session: {
        canvas: { tool_id: { value: ['canvas-session'] } },
        groups: { g1: { tool_id: { value: ['group-session'] } } },
      },
      canvasDefaults: { tool_id: ['canvas-default'] },
      groupDefaults: { tool_id: ['group-default'] },
      groupId: 'g1',
      componentId: 'c1',
      overrides: { tool_id: ['component'] },
    }
    const order = [
      'component',
      'group-session',
      'group-default',
      'canvas-session',
      'canvas-default',
    ]
    const strip = [
      (i: ResolveInput) => ({ ...i, overrides: {} }),
      (i: ResolveInput) => ({ ...i, session: { ...i.session, groups: {} } }),
      (i: ResolveInput) => ({ ...i, groupDefaults: {} }),
      (i: ResolveInput) => ({ ...i, session: { ...i.session, canvas: {} } }),
    ]
    let input = full
    for (let level = 0; level < order.length; level += 1) {
      const r = resolveFilters(input)
      expect(r.tool_id).toMatchObject({ value: [order[level]], level: order[level] })
      if (strip[level]) input = strip[level]!(input)
    }
    expect(resolveFilters({ ...input, canvasDefaults: {} }).tool_id).toBeUndefined()
  })

  it('ignores group levels for components outside the group', () => {
    const r = resolveFilters({
      dimensions: dims,
      session: { canvas: {}, groups: { g1: { lot_id: { value: ['A1'] } } } },
      canvasDefaults: {},
      groupDefaults: { tool_id: ['ET-01'] },
      groupId: null,
    })
    expect(r.lot_id).toBeUndefined()
    expect(r.tool_id).toBeUndefined()
  })

  it('never filters a component on what it published itself', () => {
    const session: SessionFilters = {
      canvas: { lot_id: { value: ['A0'] } },
      groups: { g1: { lot_id: { value: ['A1', 'A2'], source: 'table' } } },
    }
    const base = { dimensions: dims, session, canvasDefaults: {}, groupId: 'g1' }
    expect(resolveFilters({ ...base, componentId: 'wafers' }).lot_id).toEqual({
      value: ['A1', 'A2'],
      level: 'group-session',
      source: 'table',
    })
    // The table falls through to the next level.
    expect(resolveFilters({ ...base, componentId: 'table' }).lot_id).toMatchObject({
      value: ['A0'],
      level: 'canvas-session',
    })
  })

  it('treats empty values as unset', () => {
    const r = resolveFilters({
      dimensions: dims,
      session: { canvas: { tool_id: { value: [] } }, groups: {} },
      canvasDefaults: { tool_id: ['ET-03'] },
    })
    expect(r.tool_id).toMatchObject({ value: ['ET-03'], level: 'canvas-default' })
  })
})

describe('paramsFromFilters', () => {
  const dataset = {
    id: 'spc',
    params: [
      { name: 'start', type: 'datetime', filter: 'time_range.start' },
      { name: 'end', type: 'datetime', filter: 'time_range.end' },
      { name: 'tool', type: 'string', filter: 'tool_id' },
      { name: 'lot', type: 'string[]', filter: 'lot_id' },
      { name: 'parameter', type: 'string', filter: null },
    ],
  } as unknown as Dataset

  it('maps filters onto bound params', () => {
    const resolved = resolveFilters({
      dimensions: dims,
      session: {
        canvas: { tool_id: { value: ['ET-03', 'ET-01'] }, lot_id: { value: ['A1'] } },
        groups: {},
      },
      canvasDefaults: {},
    })
    const { params, bound } = paramsFromFilters(dataset, resolved, {})
    expect(params).toEqual({ start: '-7d', end: 'now', tool: 'ET-03', lot: ['A1'] })
    expect(bound.map((b) => b.param)).toEqual(['start', 'end', 'tool', 'lot'])
    expect(bound.find((b) => b.param === 'tool')).toMatchObject({
      dimension: 'tool_id',
      level: 'canvas-session',
    })
  })

  it('leaves unlinked params alone', () => {
    const resolved = resolveFilters({
      dimensions: dims,
      session: { canvas: { tool_id: { value: ['ET-03'] } }, groups: {} },
      canvasDefaults: {},
    })
    const { params, bound } = paramsFromFilters(dataset, resolved, { tool: false, start: false })
    expect(params).toEqual({ end: 'now' })
    expect(bound.map((b) => b.param)).toEqual(['end', 'lot'])
  })

  it('lets own values beat the dimension default, but not canvas values', () => {
    const own = { start: '-30d' }
    const byDefault = resolveFilters({ dimensions: dims, session: empty, canvasDefaults: {} })
    expect(paramsFromFilters(dataset, byDefault, {}, own).params).toEqual({ end: 'now' })
    const byCanvas = resolveFilters({
      dimensions: dims,
      session: empty,
      canvasDefaults: { time_range: { relative: 'last_24h' } },
    })
    expect(paramsFromFilters(dataset, byCanvas, {}, own).params).toEqual({
      start: '-24h',
      end: 'now',
    })
  })

  it('passes absolute time ranges through', () => {
    const resolved = resolveFilters({
      dimensions: dims,
      session: {
        canvas: {
          time_range: { value: { start: '2026-01-01T00:00:00Z', end: '2026-01-02T00:00:00Z' } },
        },
        groups: {},
      },
      canvasDefaults: {},
    })
    expect(paramsFromFilters(dataset, resolved, {}).params).toMatchObject({
      start: '2026-01-01T00:00:00Z',
      end: '2026-01-02T00:00:00Z',
    })
  })
})

describe('filter values', () => {
  it('round-trips through the URL', () => {
    const [time, tool] = dims
    for (const value of [
      { relative: 'last_30d' },
      { start: '2026-01-01T00:00:00.000Z', end: '2026-01-03T00:00:00.000Z' },
    ]) {
      expect(decodeFilter(time!, encodeFilter(value))).toEqual(value)
    }
    expect(decodeFilter(tool!, encodeFilter(['ET-03', 'ET-01']))).toEqual(['ET-03', 'ET-01'])
    expect(decodeFilter(time!, 'nonsense')).toBeNull()
    expect(decodeFilter(tool!, '')).toBeNull()
  })

  it('describes, detects empties, splits pasted lists, resolves presets', () => {
    expect(describeFilter(['A', 'B', 'C', 'D'])).toBe('A, B +2')
    expect(describeFilter({ relative: 'last_30d' })).toBe('Last 30 days')
    expect(isEmptyFilter([])).toBe(true)
    expect(isEmptyFilter(null)).toBe(true)
    expect(isEmptyFilter(['x'])).toBe(false)
    expect(splitPasted('A1\nA2, A3\tA1;A4 ')).toEqual(['A1', 'A2', 'A3', 'A4'])
    expect(timeRangeParams({ relative: 'last_24h' })).toEqual({ start: '-24h', end: 'now' })
  })
})
