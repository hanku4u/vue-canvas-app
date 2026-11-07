# Components

Specs for each component type. All types are registered in the frontend component registry (see [architecture.md](architecture.md#component-registry)). Data access is described in [data-layer.md](data-layer.md).

## Shared behavior

### Common fields (every component)

| Field | Notes |
| --- | --- |
| `id` | UUID, created on the client |
| `type` | `chart` · `wafer-map` · `table` · `note` |
| `title` | Shown in the header. Data components default to an auto title (e.g. "SPC – CD_MEAN") until renamed |
| `groupId` | Group membership or `null` |
| `x, y, w, h, zIndex` | Position relative to the group (if grouped) or the canvas |
| `config` | Type-specific, validated by the type's Zod schema |
| `configVersion` | For migrating old configs when a type's schema changes |
| `version` | Server-assigned, for optimistic locking |
| `access` | Server-computed `{ canEdit, viewRestricted, editRestricted }`. Never sent by the client |

### Data binding (data components)

All data components (chart, wafer map, table) share this config block:

```ts
interface DataConfig {
  dataset: string                          // dataset id, e.g. "spc_points"
  params: Record<string, ParamValue>       // fixed param values set in the inspector
  bindings: Record<string, string>         // dataset param → filter dimension ("tool" → "tool_id")
  overrides?: Record<string, FilterValue>  // component-local filter values (lowest scope)
  publish?: PublishRule[]                  // selections this component pushes to its scope
  refresh?: { auto: boolean; intervalSec?: number }  // optional auto-refresh, minimum 60 s
}

interface PublishRule {
  column: string     // column in this component's data, e.g. "lot_id"
  dimension: string  // filter dimension to set, e.g. "lot_id"
}
```

- When a dataset is picked, bindings are **auto-suggested** from the dataset's parameter `filter` hints. The user can turn individual bindings off.
- A parameter that is bound and has a filter value uses the filter value. Otherwise it uses `params`. Required parameters with neither block the query, and the component says which one is missing.
- **Publishing never feeds back into the publisher.** A component ignores its own published values for the dimension it publishes. Otherwise selecting lots in a table would filter that table down to only the selected lots.

### Lifecycle and states

`unconfigured → loading → ready | empty | error`. While refetching after a filter change, the last result stays visible (dimmed) with a spinner in the header.

### Preview (level of detail)

Each type provides a `preview` used when zoomed out, during pan or zoom gestures, and for collapsed-then-expanded groups:

- Data components show the last rendered snapshot (an image captured in memory after each successful render) plus the title. If none exists yet, they show the type icon and title.
- Snapshots are not persisted. They are a performance aid only.

### Menu actions

Refresh, duplicate, copy, bring to front or send to back, restrict access (owner and admins), delete, and, for data components, "View query details". CSV export of component data is a candidate for v1 (see open questions).

---

## Chart

Built on ECharts.

### Chart kinds (v1)

| Kind | Typical use | Shape requested |
| --- | --- | --- |
| `line` | Parameter trend over time, per tool or chamber | `timeseries` |
| `scatter` | Parameter vs parameter, or value vs time per wafer | `scatter` |
| `histogram` | Distribution of a measurement, optionally overlaid by group | `histogram` |
| `boxplot` | Distribution per tool, chamber, lot or step | `boxplot` |
| `spc` | Control chart with limits and violations | `timeseries` (with limit columns) |

### Config

```ts
interface ChartConfig extends DataConfig {
  kind: 'line' | 'scatter' | 'histogram' | 'boxplot' | 'spc'
  x?: string                 // column (line/scatter/spc: usually a timestamp)
  y?: string[]               // one or more value columns
  seriesBy?: string          // split into series by a column (e.g. chamber)
  colorBy?: string           // scatter only
  groupBy?: string           // boxplot categories, histogram overlays
  bins?: number              // histogram, default auto
  spc?: {
    value: string
    limits: {                // each is a column name or a constant
      ucl?: string | number; lcl?: string | number; target?: string | number
      usl?: string | number; lsl?: string | number
    }
    rules: ('beyond_limits' | 'run_of_7' | 'trend_of_6')[]   // v1 default: ['beyond_limits']
  }
  axes?: { yMin?: number; yMax?: number; yLog?: boolean }
  legend?: 'auto' | 'none'
}
```

### Behavior

- **Downsampling:** the chart requests about 2 points per horizontal pixel. The backend applies LTTB per series, so spikes and excursions survive. The header shows "showing 2,000 of 1.8M points" when downsampled.
- **Zoom:** the active chart supports box zoom on the x range. On zoom, it refetches that range at full resolution (up to the point budget). Double-click resets.
- **SPC:**
  - Control and spec limits are drawn as lines, and step lines when they change over time.
  - Points that violate an enabled rule are highlighted, and violations are listed in a small badge ("3 OOC").
  - v1 rule: beyond control limits. Run and trend rules come next (see open questions).
- **Tooltips** show all columns of the hovered point that are in the dataset's `tooltip` column list (lot, wafer, tool, step, ...).
- **Publishing:** clicking a point can publish its `lot_id` and `wafer_id` (configurable). Brushing an x-range on a time chart can publish `time_range` (opt-in).

---

## Wafer map

Custom Canvas 2D component. Data is die-level records with x/y coordinates and numeric values.

### Data contract

Datasets used with the wafer map must provide:

| Column | Type | Notes |
| --- | --- | --- |
| `x`, `y` | integer | Die coordinates (assumed die indices; see open questions) |
| value column(s) | float | One or more numeric measurements |
| `wafer_id` | string | Required for gallery and stacked modes |
| `lot_id` | string | Recommended. Used for titles and publishing |

### Modes

| Mode | Description |
| --- | --- |
| `single` | One wafer. If the result contains several, a wafer picker appears in the header |
| `gallery` | Small multiples, one map per wafer, on a shared color scale. Paged if there are more than about 25 wafers |
| `stacked` | One map aggregating all wafers per die (mean, median, std, min, max, or count above or below a threshold) |

### Config

```ts
interface WaferMapConfig extends DataConfig {
  mode: 'single' | 'gallery' | 'stacked'
  value: string                         // numeric column to color by
  aggregate: 'mean' | 'median' | 'std' | 'min' | 'max' | 'count'   // per die (stacked, or duplicates)
  colorScale: {
    palette: 'viridis' | 'diverging' | 'turbo'
    range: 'auto' | 'p1-p99' | { min: number; max: number }
    center?: number                     // for diverging, e.g. target value
  }
  orientation: { flipX: boolean; flipY: boolean; notch: 'down' | 'up' | 'left' | 'right' }
  showGrid: boolean
  showOutline: boolean                  // wafer circle, fitted to the die extent
}
```

### Behavior

- **Rendering:**
  - Each die is a filled cell on a grid derived from the min and max of x and y.
  - The wafer outline circle is fitted to the die extent.
  - Rendering is Canvas 2D with device-pixel-ratio scaling. Hit-testing is by grid lookup, not per-shape tests.
  - Up to about 50k dies per wafer renders comfortably. Gallery mode renders thumbnails lazily as they scroll into view.
- **Color legend:** a continuous bar with min, max and center. Values outside the range are clamped and drawn with a marker color.
- **Hover:** tooltip with x, y, value, wafer and lot.
- **Publishing:** clicking a wafer (in gallery) or the map title can publish `wafer_id` and `lot_id`.
- **Backend shape:** `wafer` aggregates per die (and per wafer, for gallery) before sending, so the browser only receives one value per die per wafer.

---

## Table

AG Grid Community with the infinite row model.

### Config

```ts
interface TableConfig extends DataConfig {
  columns: { name: string; visible: boolean; width?: number; pinned?: 'left' | 'right' }[]
  sort: { column: string; dir: 'asc' | 'desc' }[]
  columnFilters: ColumnFilter[]          // AG Grid-style text/number/date filters, applied server-side
  pageSize: number                       // default 200
  selection: 'none' | 'single' | 'multiple'
  numberFormat?: Record<string, string>  // e.g. { thickness: '0.00' }
}
```

### Behavior

- **Server-paged:** the grid requests blocks (`offset`, `limit`, `sort`, `columnFilters`) through the `table` shape. The backend pages from a cached copy of the full dataset result, so sorting and filtering don't re-hit the data API.
- **Column management:** show or hide, reorder, resize and pin columns from the column menu. All of it is saved in config (by editors).
- **Viewers** can sort and filter for their session, but the change isn't saved.
- **Row selection → publishing:** with `publish: [{ column: 'lot_id', dimension: 'lot_id' }]`, selecting rows sets `lot_id` for the table's scope (its group, or the canvas). Clearing the selection removes the published value.
- **Copy:** selected cells or rows copy as tab-separated text, so they paste cleanly into Excel.
- **Row count:** the footer shows total rows (from result metadata) and the selection count.

---

## Note

Markdown annotation for context, conclusions and to-dos.

### Config

```ts
interface NoteConfig {
  markdown: string
  color: 'default' | 'yellow' | 'blue' | 'green' | 'red'
  fontSize: 'sm' | 'md' | 'lg'
}
```

### Behavior

- Double-click (editors) switches to an edit textarea. Click outside or press Ctrl/⌘ + Enter to return to rendered view.
- Rendered with `markdown-it` and sanitized with DOMPurify. Supports headings, lists, task lists, links, inline code and tables. No raw HTML.
- No data binding, publishing or preview snapshot. A note is cheap enough to render live at any zoom, with text hidden below about 30% zoom.

---

## Adding a new component type

1. Create `frontend/src/components/<type>/` with:
   - `schema.ts`: a Zod config schema with defaults and `.meta()` hints for the inspector (see `src/registry/inspectorFields.ts`)
   - a view component (props: `component`, `config`, `editable`, `active`; emits `update-config` with a partial config)
   - optionally a preview component and an extra inspector component
   - `index.ts` exporting the `ComponentDefinition`
2. Add the definition to the list in `frontend/src/components/index.ts`.
3. If it needs a new data shape, add it to `backend/app/shaping/` and to the `shape` union in [api.md](api.md#post-apiquery).
4. Document it in this file.

When a type's config shape changes, bump `configVersion` and handle the old shape in `migrateConfig`. Saved components are migrated when they're read.

Candidates after v1: KPI or stat tile, image or link embed, Pareto chart, bin map (categorical wafer map) if bin data becomes available, equipment state timeline.
