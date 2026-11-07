import { describe, expect, it } from 'vitest'
import { tableFromArrays, tableToIPC } from 'apache-arrow'
import { decodeArrow } from '@/data/arrow'

describe('decodeArrow', () => {
  it('decodes an Arrow IPC stream into the columnar result shape', async () => {
    const table = tableFromArrays({
      lot_id: ['A1', 'A2'],
      value: new Float64Array([1.5, 2.5]),
      slot: new Int32Array([1, 2]),
    })
    const bytes = tableToIPC(table, 'stream')
    const result = await decodeArrow(bytes, JSON.stringify({ rowsReturned: 2 }))
    expect(result.columns).toEqual([
      { name: 'lot_id', type: 'string' },
      { name: 'value', type: 'float' },
      { name: 'slot', type: 'int' },
    ])
    expect(result.data).toEqual({ lot_id: ['A1', 'A2'], value: [1.5, 2.5], slot: [1, 2] })
    expect(result.meta.rowsReturned).toBe(2)
  })
})
