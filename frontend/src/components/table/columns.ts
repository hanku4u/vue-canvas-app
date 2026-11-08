import type { DatasetColumn } from '@/api/types'
import type { TableColumn } from './schema'

/**
 * Dataset columns in the saved order, with saved visibility, width and pinning. Columns
 * the dataset gained since the layout was saved are appended (visible).
 */
export function orderedColumns(dataset: DatasetColumn[], saved: TableColumn[]): TableColumn[] {
  const names = new Set(dataset.map((c) => c.name))
  const known = saved.filter((c) => names.has(c.name))
  const added = dataset
    .filter((c) => !known.some((k) => k.name === c.name))
    .map((c) => ({ name: c.name, visible: true }))
  return [...known, ...added]
}
