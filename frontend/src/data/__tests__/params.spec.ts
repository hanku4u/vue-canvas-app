import { describe, expect, it } from 'vitest'
import type { Dataset } from '@/api/types'
import { effectiveParams, isRelativeTime, missingRequired, resolveTime } from '@/data/params'

const NOW = Date.parse('2026-11-07T12:34:56Z')

const dataset: Dataset = {
  id: 'd',
  label: 'D',
  category: 'C',
  description: '',
  columns: [],
  tooltip: [],
  suits: ['table'],
  params: [
    {
      name: 'parameter',
      type: 'string',
      required: true,
      filter: null,
      valuesFrom: null,
      default: 'CD_MEAN',
    },
    {
      name: 'start',
      type: 'datetime',
      required: true,
      filter: 'time_range.start',
      valuesFrom: null,
      default: '-7d',
    },
    {
      name: 'end',
      type: 'datetime',
      required: true,
      filter: 'time_range.end',
      valuesFrom: null,
      default: 'now',
    },
    { name: 'lot', type: 'string[]', required: true, filter: 'lot_id', valuesFrom: null },
    { name: 'tool', type: 'string[]', required: false, filter: 'tool_id', valuesFrom: null },
  ],
}

describe('relative times', () => {
  it('resolves tokens rounded down to the minute', () => {
    expect(resolveTime('now', NOW)).toBe('2026-11-07T12:34:00.000Z')
    expect(resolveTime('-24h', NOW)).toBe('2026-11-06T12:34:00.000Z')
    expect(resolveTime('-7d', NOW)).toBe('2026-10-31T12:34:00.000Z')
    expect(resolveTime('2026-01-01T00:00:00Z', NOW)).toBe('2026-01-01T00:00:00Z')
    expect(isRelativeTime('-30m')).toBe(true)
    expect(isRelativeTime('yesterday')).toBe(false)
  })
})

describe('effectiveParams', () => {
  it('applies defaults, resolves times and drops empty values', () => {
    expect(effectiveParams(dataset, { lot: ['A1'], tool: [], start: '-24h' }, NOW)).toEqual({
      parameter: 'CD_MEAN',
      start: '2026-11-06T12:34:00.000Z',
      end: '2026-11-07T12:34:00.000Z',
      lot: ['A1'],
    })
  })

  it('reports required params without a value', () => {
    const params = effectiveParams(dataset, {}, NOW)
    expect(missingRequired(dataset, params).map((p) => p.name)).toEqual(['lot'])
  })
})

describe('required groups', () => {
  it('needs at least one param of the group', () => {
    const grouped: Dataset = {
      ...dataset,
      params: [
        {
          name: 'lot',
          label: 'Lots',
          type: 'string[]',
          required: false,
          filter: null,
          valuesFrom: null,
          requiredGroup: 't',
        },
        {
          name: 'wafer',
          label: 'Wafers',
          type: 'string[]',
          required: false,
          filter: null,
          valuesFrom: null,
          requiredGroup: 't',
        },
      ],
    }
    expect(missingRequired(grouped, {}).map((p) => p.label)).toEqual(['Lots or Wafers'])
    expect(missingRequired(grouped, { wafer: ['A1.01'] })).toEqual([])
  })
})
