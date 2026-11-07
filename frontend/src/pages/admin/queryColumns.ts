import { h } from 'vue'
import { RouterLink } from 'vue-router'
import type { DataTableColumns } from 'naive-ui'
import type { ErrorEvent, QueryEvent } from '@/api/admin'
import { formatCompact, formatDateTime, formatDuration } from '@/ui/format'

const canvasLink = (row: { canvasId: string | null; canvasTitle: string | null }) =>
  row.canvasId
    ? h(RouterLink, { to: { name: 'canvas', params: { id: row.canvasId } } }, () => row.canvasTitle)
    : '—'

export const slowColumns: DataTableColumns<QueryEvent> = [
  { title: 'Time', key: 'ts', render: (r) => formatDateTime(r.ts), width: 170 },
  { title: 'User', key: 'user' },
  { title: 'Dataset', key: 'dataset' },
  { title: 'Canvas', key: 'canvasId', render: canvasLink },
  {
    title: 'Duration',
    key: 'durationMs',
    align: 'right',
    render: (r) => formatDuration(r.durationMs),
    sorter: (a, b) => a.durationMs - b.durationMs,
  },
  {
    title: 'Upstream / shaping',
    key: 'upstreamMs',
    align: 'right',
    render: (r) => `${formatDuration(r.upstreamMs)} / ${formatDuration(r.shapingMs)}`,
  },
  { title: 'Rows', key: 'rows', align: 'right', render: (r) => formatCompact(r.rows) },
  { title: 'Request', key: 'requestId', render: (r) => h('code', r.requestId) },
]

export const errorColumns: DataTableColumns<ErrorEvent> = [
  { title: 'Time', key: 'ts', render: (r) => formatDateTime(r.ts), width: 170 },
  { title: 'Code', key: 'code', render: (r) => h('code', r.code) },
  { title: 'Message', key: 'message', ellipsis: { tooltip: true } },
  { title: 'User', key: 'user' },
  { title: 'Dataset', key: 'dataset' },
  { title: 'Canvas', key: 'canvasId', render: canvasLink },
  { title: 'Request', key: 'requestId', render: (r) => h('code', r.requestId) },
]
