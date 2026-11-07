import type { ColumnType, QueryMeta, QueryResult } from '@/api/types'

export const ARROW_MIME = 'application/vnd.apache.arrow.stream'

/**
 * Decode an Arrow IPC stream (large /api/query results, docs/data-layer.md#wire-formats)
 * into the same columnar shape as JSON results. `apache-arrow` is loaded on demand so it
 * only costs bandwidth when the server actually sends Arrow.
 */
export async function decodeArrow(
  bytes: ArrayBuffer | Uint8Array,
  metaHeader: string | null,
): Promise<QueryResult> {
  const { tableFromIPC, Type } = await import('apache-arrow')
  const table = tableFromIPC(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))

  const columns: QueryResult['columns'] = []
  const data: QueryResult['data'] = {}
  for (const field of table.schema.fields) {
    // Dictionary-encoded columns (e.g. Polars categoricals) are typed by their values.
    const valueType =
      (field.type.typeId as number) === Type.Dictionary
        ? (field.type as { dictionary: typeof field.type }).dictionary
        : field.type
    const typeId = valueType.typeId as number
    let type: ColumnType | 'unknown' = 'unknown'
    let toValue = (v: unknown): unknown => v
    if (typeId === Type.Int) {
      type = 'int'
      toValue = (v) => (typeof v === 'bigint' ? Number(v) : v)
    } else if (typeId === Type.Float) type = 'float'
    else if (typeId === Type.Utf8 || typeId === Type.LargeUtf8) type = 'string'
    else if (typeId === Type.Bool) type = 'bool'
    else if (typeId === Type.Timestamp || typeId === Type.Date) {
      type = 'datetime'
      toValue = (v) =>
        v === null || v === undefined
          ? null
          : new Date(Number(v)).toISOString().replace('.000Z', 'Z')
    }
    columns.push({ name: field.name, type })
    const vector = table.getChild(field.name)
    const values: unknown[] = []
    for (let i = 0; i < table.numRows; i += 1) values.push(toValue(vector?.get(i) ?? null))
    data[field.name] = values
  }

  const meta = (metaHeader ? JSON.parse(metaHeader) : {}) as QueryMeta
  return { columns, data, meta }
}
