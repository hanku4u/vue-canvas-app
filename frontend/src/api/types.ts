/**
 * API types, hand-written from docs/api.md.
 * Replace with types generated from FastAPI's OpenAPI schema once the backend exists.
 */

export interface Me {
  knoxId: string
  displayName: string
  isAdmin: boolean
}

export interface UserRef {
  knoxId: string
  displayName: string
}

export interface ApiErrorBody {
  error: {
    code: string
    message: string
    requestId?: string
    details?: unknown
  }
}

export interface Page<T> {
  items: T[]
  nextCursor: string | null
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export type TimeRangeValue = { relative: string } | { start: string; end: string }

export type FilterValue = string[] | TimeRangeValue | { min?: number; max?: number }

export type FilterSet = Record<string, FilterValue>

// ---------------------------------------------------------------------------
// Canvases
// ---------------------------------------------------------------------------

/**
 * The caller's role on a canvas. `admin` means access comes only from app-wide
 * admin rights (no ownership or share).
 */
export type CanvasRole = 'owner' | 'editor' | 'viewer' | 'admin'

export type CanvasListScope = 'mine' | 'shared' | 'all'

export interface CanvasSummary {
  id: string
  title: string
  description: string
  owner: UserRef
  role: CanvasRole
  componentCount: number
  version: number
  updatedAt: string
}

export interface ComponentAccess {
  canEdit: boolean
  viewRestricted: boolean
  editRestricted: boolean
}

export interface CanvasComponent {
  id: string
  type: string
  title: string
  groupId: string | null
  x: number
  y: number
  w: number
  h: number
  zIndex: number
  config: Record<string, unknown>
  configVersion: number
  version: number
  access: ComponentAccess
  updatedBy: string
  updatedAt: string
}

export interface CanvasGroup {
  id: string
  title: string
  x: number
  y: number
  w: number
  h: number
  zIndex: number
  collapsed: boolean
  defaultFilters: FilterSet
  version: number
}

export interface Canvas {
  id: string
  title: string
  description: string
  owner: UserRef
  role: CanvasRole
  canManageAccess: boolean
  version: number
  revision: number
  defaultFilters: FilterSet
  groups: CanvasGroup[]
  components: CanvasComponent[]
  updatedAt: string
}

export interface CreateCanvasRequest {
  title: string
  description?: string
}

export interface DuplicateCanvasRequest {
  title: string
}

// ---------------------------------------------------------------------------
// Ops (POST /api/canvases/{id}/ops)
// ---------------------------------------------------------------------------

export type EditableComponentFields = Pick<
  CanvasComponent,
  'title' | 'groupId' | 'x' | 'y' | 'w' | 'h' | 'zIndex' | 'config' | 'configVersion'
>

export type NewComponent = EditableComponentFields & Pick<CanvasComponent, 'id' | 'type'>

export type EditableGroupFields = Pick<
  CanvasGroup,
  'title' | 'x' | 'y' | 'w' | 'h' | 'zIndex' | 'collapsed' | 'defaultFilters'
>

export type CanvasOp =
  | {
      op: 'canvas.update'
      version: number
      set: Partial<Pick<Canvas, 'title' | 'description' | 'defaultFilters'>>
    }
  | { op: 'component.create'; component: NewComponent }
  | { op: 'component.update'; id: string; version: number; set: Partial<EditableComponentFields> }
  | { op: 'component.delete'; id: string; version: number }
  | { op: 'group.create'; group: Partial<EditableGroupFields> & Pick<CanvasGroup, 'id' | 'title'> }
  | { op: 'group.update'; id: string; version: number; set: Partial<EditableGroupFields> }
  | { op: 'group.delete'; id: string; version: number; mode: 'ungroup' | 'withContents' }

export interface OpsRequest {
  ops: CanvasOp[]
}

export interface OpsResult {
  revision: number
  /** New versions keyed by entity id; the canvas itself is keyed as "canvas". */
  versions: Record<string, number>
}

export interface VersionConflict {
  opIndex: number
  id: string
  current: unknown
}

// ---------------------------------------------------------------------------
// Datasets and queries (docs/api.md#data, docs/data-layer.md)
// ---------------------------------------------------------------------------

export type DatasetParamType =
  'string' | 'string[]' | 'int' | 'float' | 'bool' | 'date' | 'datetime' | 'enum'

export interface DatasetParam {
  name: string
  label?: string
  type: DatasetParamType
  required: boolean
  /** Filter dimension this param can bind to (e.g. "tool_id", "time_range.start"). */
  filter: string | null
  /** Where a value picker gets its options. */
  valuesFrom: { dataset: string; column: string } | null
  /** Allowed values for enums. */
  values?: string[]
  /** Default value; datetimes may be relative ("now", "-7d", "-24h"). */
  default?: unknown
}

export type ColumnType = 'string' | 'int' | 'float' | 'bool' | 'datetime'

export interface DatasetColumn {
  name: string
  type: ColumnType
  label?: string
}

export type ComponentKind = 'chart' | 'table' | 'wafer-map' | 'data-preview'

export interface Dataset {
  id: string
  label: string
  category: string
  description: string
  params: DatasetParam[]
  columns: DatasetColumn[]
  tooltip: string[]
  suits: ComponentKind[]
}

export interface ColumnFilter {
  column: string
  op: 'contains' | 'equals' | 'notEquals' | 'startsWith' | 'gt' | 'gte' | 'lt' | 'lte' | 'in'
  value: unknown
}

export type Shape =
  | { kind: 'raw'; columns?: string[]; limit: number }
  | {
      kind: 'timeseries'
      x: string
      y: string[]
      seriesBy?: string
      targetPoints: number
      xRange?: [string, string]
    }
  | { kind: 'scatter'; x: string; y: string; colorBy?: string; maxPoints: number }
  | { kind: 'histogram'; column: string; bins?: number; groupBy?: string }
  | { kind: 'boxplot'; value: string; groupBy: string; maxOutliers?: number }
  | {
      kind: 'table'
      columns?: string[]
      offset: number
      limit: number
      sort?: { column: string; dir: 'asc' | 'desc' }[]
      filters?: ColumnFilter[]
    }
  | {
      kind: 'wafer'
      x: string
      y: string
      value: string
      waferBy?: string
      mode: 'single' | 'gallery' | 'stacked'
      aggregate: 'mean' | 'median' | 'std' | 'min' | 'max' | 'count'
      wafers?: string[]
    }
  | { kind: 'distinct'; column: string; search?: string; limit: number }

export interface QueryRequest {
  dataset: string
  params: Record<string, unknown>
  shape: Shape
  context?: { canvasId?: string; componentId?: string }
  cache?: 'default' | 'refresh'
}

export interface QueryMeta {
  shape: Shape['kind']
  rowsUpstream: number
  rowsReturned: number
  downsampled: boolean
  cacheHit: boolean
  asOf: string
  durationMs: number
  upstreamMs: number
  requestId?: string
  /** table: rows after column filters */
  totalRows?: number
  /** histogram: bin edges */
  edges?: number[]
  /** wafer: extents and all wafer ids */
  xRange?: [number, number]
  yRange?: [number, number]
  valueRange?: [number, number]
  wafers?: string[]
}

/** Columnar result: one array per column, all the same length. */
export interface QueryResult {
  columns: { name: string; type: ColumnType | 'unknown' }[]
  data: Record<string, unknown[]>
  meta: QueryMeta
}

export interface ValuesResponse {
  values: string[]
  truncated: boolean
}
