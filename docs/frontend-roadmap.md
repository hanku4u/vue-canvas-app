# Frontend roadmap

The Vue application, broken into milestones. Each milestone ends with something that can be run and tried. Specs live in the other docs; this file is about **order, scope per step, and done-criteria**.

Sizes: **S** ≈ 1–2 days · **M** ≈ 3–5 days · **L** ≈ 1–2 weeks (one developer, rough).

## Overview

```
 Foundation                Canvas                         Data                          Collaboration & admin
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────┐ ┌──────┐ ┌──────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│ F0 Setup │→│ F1 Shell │→│ F2 Canvas│→│ F3 Comp. │→│ F4 Doc & │→│ F6 Data  │→│F7 Tbl│→│F8 Cht│→│F9 Waf│→│F10 Filter│→│F11 Share │→│F12 Admin │→ F13 Hardening
└──────────┘  └──────────┘  │   core   │  │ framework│  │ persist. │  │foundation│ └──────┘ └──────┘ └──────┘  │ & x-filt.│  │ & perms  │  └──────────┘
                            └──────────┘  └──────────┘  └────┬─────┘  └──────────┘                             └──────────┘  └──────────┘
                                                             └→ F5 Groups ─────────────────────────────────────────↑
                                                   ★ Demo milestone = F0–F10 (the ET-03 investigation story works end to end)
```

| # | Milestone | Size | Outcome |
| --- | --- | --- | --- |
| F0 | Project setup | S | Tooling, CI, API mocking in place |
| F1 | App shell and Home | S | Navigate, list and create canvases |
| F2 | Canvas core | M | Infinite canvas with pan, zoom, select, move, resize |
| F3 | Component framework and Note | M | Registry, palette, inspector, component chrome, first component type |
| F4 | Document model, undo/redo, persistence | L | Edits saved through ops with undo/redo, conflicts, copy/paste |
| F5 | Groups | M | Group, ungroup, collapse, move as a unit |
| F6 | Data foundation | M | Dataset picker, query hooks, loading, empty and error states |
| F7 | Table component | M | Server-paged lot table with selection |
| F8 | Chart component | L | Trend, scatter, histogram, box plot, SPC |
| F9 | Wafer map component | L | Single, gallery and stacked wafer maps |
| F10 | Filters and cross-filtering | L | Filter bar, group filters, bindings, publishing, URL sync |
| F11 | Sharing and permissions UI | M | Viewer mode, share dialog, component restrictions |
| F12 | Admin screens | L | Permissions, usage and health, audit |
| F13 | Hardening | M | Performance, accessibility, end-to-end demo test |

★ **Demo milestone (F0–F10):** an engineer can build the [ET-03 investigation](mock-data-api.md#the-planted-excursion-demo-story) from an empty canvas: SPC chart → lot table → wafer maps, all linked by filters.

## Backend dependency strategy

The frontend talks only to FastAPI ([api.md](api.md)), which doesn't exist yet. To avoid blocking, the frontend is built **contract-first against an in-browser mock of FastAPI**:

| Piece | Until the real backend exists | After |
| --- | --- | --- |
| Canvas, ops, shares, admin, `me` endpoints | **MSW** (Mock Service Worker) handlers implementing [api.md](api.md) with an in-memory store persisted to localStorage. The mock enforces the permission rules from [permissions.md](permissions.md) so the UI is tested against realistic 403/404/409 responses | Turn MSW off. The Vite dev proxy sends `/api` to FastAPI |
| `/api/datasets`, `/api/filters` | MSW returns fixtures mirroring the planned dataset YAML | Real endpoints |
| `/api/query` | MSW handler calls the **mock data API** (`:8001`) and applies simple JS shaping (table paging, a basic LTTB, per-die passthrough). Slow for big ranges, but realistic data | Real backend shaping and caching |
| Identity | A dev "switch user" menu sets the Knox ID the MSW mock uses, so permission states can be tested | `x-knox-id` from the gateway |
| Types | Hand-written from api.md in `src/api/types.ts` | Generated with `openapi-typescript` from FastAPI's schema. Drift shows up as type errors |

MSW is toggled by `VITE_API_MOCK=1`. Handlers live in `frontend/src/mocks/` and are deleted, not maintained, once the backend covers them.

---

## F0: Project setup · S ✅

**Scope**
- `frontend/` with Vite, Vue 3, TypeScript (strict), vue-router, Pinia, `@tanstack/vue-query`, Naive UI (theme overrides, light and dark), Zod.
- ESLint, Prettier, `vue-tsc` typecheck. Vitest + Vue Test Utils. Playwright.
- MSW set up with the mock toggle. Vite proxy for `/api` (FastAPI) and `/mock-data` (mock data API, for the MSW query handler).
- Folder structure from [architecture.md](architecture.md#modules).
- CI (GitHub Actions): lint, typecheck, unit tests and build for `frontend/`, plus pytest for `mock-data-api/`.
- Root dev script to start the mock data API and the Vite dev server together.

**Done when:** `npm run dev` shows a placeholder page with MSW active, and CI is green on a PR.

## F1: App shell and Home · S ✅

**Scope**
- Layout: top bar (app name, Admin link if `isAdmin`, user menu with dev user switcher), router outlet, toasts, global error boundary, 404 page.
- `me` store (`GET /api/me`).
- Home: "My canvases" and "Shared with me" cards, search, New canvas, card menu (open, rename, duplicate, delete) per [canvas-ux.md](canvas-ux.md#home).
- Routes: `/`, `/canvas/:id`, `/admin/*` (guarded).

**Done when:** you can create a canvas, see it listed, open its (empty) editor route, rename and delete it, all against MSW.

## F2: Canvas core · M ✅

**Scope**
- Vue Flow canvas with background dot grid, minimap and zoom controls. Zoom range 10–200%.
- Pan (empty-canvas drag, Space+drag, middle mouse, trackpad) and zoom (Ctrl+wheel, pinch, `+`/`-`, fit, reset).
- Selection: click, Shift+click, Shift+drag box, Ctrl+A. Move by drag and arrow-key nudge. Resize with min sizes. 16 px snap (Alt to disable). Z-order `[` `]`.
- Central shortcut registry (scoped so shortcuts don't fire inside inputs) and right-click context menu.
- Viewport persisted per canvas in localStorage.
- Placeholder nodes (plain boxes) to exercise all of the above.

**Done when:** 50 placeholder nodes can be panned, zoomed, selected, moved and resized smoothly. The viewport is restored on reload.

**As built:**
- Edits live in the `canvasDoc` Pinia store and are local only. A "Not saved" tag shows in the top bar until F4 adds persistence.
- Vue Flow owns positions during a gesture, and the store is updated when the gesture ends. That is the natural point to emit one op per gesture in F4.
- Fit and zoom-to-selection compute bounds from the store, not Vue Flow's `fitView`. Off-screen nodes are never rendered (visible-only rendering), so Vue Flow has never measured them.
- The viewport is saved from a debounced watcher. Vue Flow's `viewportChangeEnd` doesn't fire for programmatic zooms.
- Placeholders are added from the right-click menu (plus "Add 50 placeholders" in dev builds). The seed "ET-03 CD excursion" canvas has three, one of them edit-restricted.
- Measured: with 50 placeholders all on screen, wheel-panning runs at a steady 16.7 ms per frame (headless Chromium).

## F3: Component framework and Note · M ✅

**Scope**
- Component registry (`ComponentDefinition` from [architecture.md](architecture.md#component-registry)), including config schema, versioning and migration hooks.
- Component chrome: header (icon, title, markers, menu), body, hover footer.
- **Activation model:** click to activate. The active component's body gets `nowheel`/`nodrag`. Esc deactivates.
- Palette: drag-to-place and click-to-place. Drop into the viewport center.
- Inspector: schema-driven form generator for Zod configs (string, number, enum, boolean, array of enum), plus a slot for custom inspectors.
- **Level of detail:** preview below 50% zoom and during gestures. Off-screen nodes not mounted.
- **Note** component: Markdown edit and view (`markdown-it` + DOMPurify), colors, font size.
- Empty canvas state.

**Done when:** notes can be added from the palette, edited, styled and arranged. Zooming out swaps to previews. Adding a new dummy type only takes a folder and a registration.

**As built:**
- **Registry:** `src/registry/` holds the registry plus config resolution (migrate, validate, fall back to defaults with an error). Types live in `src/components/<type>/index.ts` and are listed in `src/components/index.ts`.
- **Inspector forms:** generated from each type's Zod schema via `z.toJSONSchema`. Field hints use `.meta()`: `title`, `description`, `x-inspector`, `x-widget` (`textarea`, `segmented`, `swatches`), `x-enum-labels`, `x-swatches`, `x-order`.
- **Component frame:** icon, title, lock marker, and a ⋯ menu (duplicate, front/back, delete). Unknown types, invalid configs (with "Reset to defaults") and render crashes are all contained in the frame.
- **Activation:** clicking a component activates it, and its body gets `nodrag nowheel`, so the header remains the drag handle. Esc deactivates first, then clears the selection.
- **Level of detail:** previews kick in below 50% zoom, and note text hides below 30%. Switching to previews *during* pan and zoom gestures is deferred to F8, where it can be measured against real charts: remounting heavy views after every pan may cost more than it saves.
- **Deferred:** the hover footer showing filter bindings comes in F10.
- **Note:** Markdown via `markdown-it`, with raw HTML off, task lists, and DOMPurify sanitizing; links open in a new tab. Placeholders stay registered (for seeded slots and the dev menu) but aren't in the palette.

## F4: Document model, undo/redo, persistence · L ✅

**Scope**
- `canvasDoc` store hydrated from `GET /api/canvases/{id}`.
- **Ops layer:** every mutation is an op (`component.create/update/delete`, `group.*`, `canvas.update`) with a computed inverse. One code path for local apply, undo and sync.
- `history` store: undo/redo stacks. Gesture coalescing (one drag is one undo step).
- `sync` queue: coalesce and debounce (about 1 s), `POST /ops`, apply returned versions, retry with backoff, offline state.
- Save status indicator: Saving, Saved, Offline, Conflict.
- **Conflict handling:** a 409 opens a dialog with "keep theirs" or "reapply mine". A 403 rolls back with a toast.
- Copy/paste (clipboard JSON, works across canvases) and duplicate (Ctrl+D). Delete.
- Refetch the canvas on window focus. Merge remote changes for components without pending local ops.
- MSW handler for `/ops` with versioning and conflict simulation (a dev toggle to force conflicts).

**Done when:** edits survive reload. Undo/redo works across all edit types. Two browser tabs editing different components don't conflict, and the same component produces a conflict dialog. Unit tests cover op/inverse pairs and queue coalescing.

**As built (`src/sync/`):**
- **`ops.ts`:** local ops (create / update / delete) with inverses. One user action is one transaction and one undo step. Consecutive nudges or inspector number edits merge within 1 s.
- **`pending.ts`:** what the server doesn't have yet, tracked per component and field, not as a queue of ops. Edits coalesce: create + delete cancels out, and delete + re-create becomes a full update. Wire ops are built at send time with each component's latest server version.
- **`canvasSync.ts`:** one batch in flight at a time, about 1 s debounce. Network or 5xx errors → offline with backoff (1 s up to 30 s). 409 → conflict dialog. 400/403/404 → the canvas is reloaded from the server.
- **Conflict dialog:** resolves all conflicting components at once ("keep theirs" or "reapply mine"), not one by one.
- **Remote changes:** the canvas is refetched when the window regains focus and merged, keeping components that have unsaved local edits.
- **Copy/paste:** goes through localStorage (works across canvases and tabs, no clipboard permission), and is also written to the system clipboard as JSON.
- **Mock backend:** re-reads its localStorage-backed data per request, so two tabs act as two clients of one server. `localStorage['mock.failOps'] = 'network' | '503'` simulates save failures, and the canvas menu (dev) has "Simulate edit by another user" to trigger conflicts.

## F5: Groups · M ✅

**Scope**
- Create from selection (Ctrl+G), ungroup (Ctrl+Shift+G). Groups are Vue Flow parent nodes.
- Group header: rename, collapse/expand (children unmounted when collapsed), menu.
- Drag components in and out of groups (membership change with position conversion).
- Delete group: "ungroup" vs "with contents" (respecting `CONTAINS_UNEDITABLE`).
- All group edits are ops with inverses.

**Done when:** groups behave per [canvas-ux.md](canvas-ux.md#groups), including undo and persistence.

**As built:**
- **Positions:** component `x`/`y` are relative to the group, so moving a group is a single `group.update`. Membership is decided on drop by the component's center (collapsed groups don't take drops), and the drop point keeps its absolute position.
- **Delete:** pressing Delete on a group removes the frame and keeps the contents (the safe default). "Delete group and contents" is in the group menu and the inspector, and is refused if any child is locked for you.
- **Locked components:** they can't be put into a new group by someone they're locked for. Ungrouping moves them out anyway (the group's layout belongs to canvas editors).
- **Copy/paste:** works in absolute coordinates. Pasted or palette-dropped components join the group they land in.
- **Resize handles:** Vue Flow's NodeResizer clamps a node to its minimum whenever it mounts, which fought collapse and expand. Group resizers therefore stay mounted with a header-height minimum, and the 240 × 120 minimum is enforced when a resize ends.
- **Mock backend:** applies ops in sequence with a snapshot rollback for atomicity.

## F6: Data foundation · M ✅

**Scope**
- `GET /api/datasets` store. Dataset picker (grouped by category, filtered by `suits`).
- Parameter form generated from dataset params, with value pickers (`/api/datasets/{id}/values/{param}`).
- `useComponentQuery(definition, config, effectiveParams, shape)`: TanStack Query wrapper with stable query keys, 250 ms debounce, `keepPreviousData`, `context` for logging.
- JSON columnar decoding, and Arrow decoding (`apache-arrow`) when the header indicates it.
- Shared states: unconfigured, loading skeleton, refetching (dimmed), empty ("no data for …"), error (code, retry, request ID).
- Header: data age from `meta.asOf`, refresh (sends `cache: "refresh"`), "View query details" panel.
- Optional auto-refresh (≥ 60 s).
- MSW `/api/query` handler backed by the mock data API with basic shaping.

**Done when:** a debug component can pick any dataset, fill params and show the raw result, with every state reachable (latency and failure forced with the mock API's `x-mock-*` headers).

**As built:**
- **Data preview** (`src/components/data-preview/`) is the debug component. It stays in the palette as a way to explore any dataset.
- **Data components:** set `dataKind` in their definition. The inspector then shows a **Data** section: a dataset picker grouped by category and filtered by `suits`, plus a parameter form with a widget per type. Datetimes take relative presets (`now`, `-7d`, …, resolved per query, rounded to the minute) or an absolute time. Lists support remote value search (`/values`) or free typing. Parameters show which filter dimension they can follow (wired in F10).
- **`useComponentQuery`** (`src/data/`): resolves params, waits 250 ms after changes, and keys the cache on dataset + params + shape, so identical queries share a request. It keeps the previous result while refetching, auto-refreshes (off / 1 / 5 / 15 min), and refreshes on demand (fresh `now`, `cache: "refresh"`). It publishes its state to `componentData`, so the frame header can show data age, a refresh button, and "Refresh data" / "View query details" in its menu.
- **States** (`DataStateView`): unconfigured, missing parameters, loading, refetching (dimmed), empty, and error (code, request ID, Retry).
- **Arrow:** decoded on demand (`apache-arrow` is lazy-loaded), including dictionary-encoded strings.
- **Mock:** `/api/datasets`, `/values` and `/api/query` (`src/mocks/handlers/data.ts`, shaping in `src/mocks/shaping.ts`: LTTB, histogram, box plot, wafer, table paging and filters, distinct) call the mock data API through the Vite proxy, with a 5-minute cache. Dev switches: `localStorage['mock.dataLatencyMs']` and `localStorage['mock.dataFail']` are forwarded as `x-mock-*` headers.
- **E2E:** Playwright now also starts the mock data API (`uv` is needed in CI).

## F7: Table component · M ✅

**Scope** (spec: [components.md](components.md#table))
- AG Grid Community, infinite row model, `table` shape (offset, limit, sort, column filters).
- Column chooser, reorder, resize and pin, saved in config by editors and session-only for viewers.
- Number formats, total row count footer, copy as TSV.
- Row selection (single or multi). Publish rules are configured in the inspector; the actual publishing is wired in F10.
- Preview: header plus first rows snapshot.

**Done when:** the `lots` dataset (7 days, about 300 lots) and `spc_points` site data (about 100k rows) scroll smoothly with server-side sort and filter.

**As built (`src/components/table/`):**
- **Paging:** AG Grid Community 36 with only the modules it needs, and the infinite row model with blocks of "Rows per request" (default 200). Every block goes through the TanStack cache under the same key scheme as `useComponentQuery`. The first block drives the shared states, data age and query details.
- **Saved layout:** sort, column filters (AG Grid text/number/date filter model, one condition each) and column layout (order, width, pinning, visibility) are saved in the config by editors. Viewers' changes stay in their session.
- **Inspector:** a column chooser and "Selected rows set filters" publish rules (column → dimension). Publishing itself is wired in F10. Row selection is already mirrored into `canvasUi.rowSelections`.
- **Keyboard:** the grid owns the keyboard (`data-own-keyboard`). Canvas shortcuts step aside except Escape, so arrows move between cells and Ctrl/⌘+C copies the selected (or focused) rows as TSV.
- **Display:** numbers use the "Decimals" setting (instead of per-column formats). Booleans show as ✓. With an active filter, an empty result still shows the grid so the filter can be changed.
- **Measured:** 75k site-level SPC rows. Jumping to row 20,000 renders at once and fills in when the block arrives.

## F8: Chart component · L ✅

**Scope** (spec: [components.md](components.md#chart))
- ECharts via `vue-echarts`. Tree-shaken imports. A theme matching the app tokens.
- Kinds: line/trend (`timeseries`), scatter, histogram, box plot, SPC.
- SPC: UCL/LCL/target/USL/LSL as step lines, beyond-limits highlighting, "N OOC" badge.
- Point budget derived from component width. Box zoom refetches the zoomed x-range. Double-click resets.
- Tooltips from the dataset `tooltip` columns. Series split (`seriesBy`), legend.
- Snapshot capture (`getDataURL`) for the LOD preview.
- Inspector: kind-specific config (x, y, seriesBy, limits mapping, rules).

**Done when:** `CD_MEAN` for ET-03 over 30 days renders as an SPC chart split by chamber, and the chamber-C excursion stands out with OOC points highlighted.

**As built (`src/components/chart/`):**
- **Rendering:** ECharts 6 via `vue-echarts`, registering only the line, scatter, bar and box plot charts, the components the chart uses, and the canvas renderer. Options are pure functions (`options.ts`) of the query result.
- **Fields:** default to *auto*. After picking a dataset, the chart uses its datetime column for x, `value` (or the first measure) for y, splits series by the first of chamber / tool / product / status, and picks limit columns by name. The chart inspector overrides any of them ("None" turns a split off).
- **Colors** follow the dataviz method. The categorical palette was validated against the app's light and dark chart surfaces (`src/ui/vizPalette.ts`). Colors follow the entity (`ColorSlots`), so filtering never repaints the remaining series. There's a legend for two or more series, at the bottom; the top row is kept for badges.
- **SPC:** step lines for UCL / LCL / target / USL / LSL, labeled directly. Out-of-control points use the reserved critical red *and* a diamond shape, plus an "N OOC" badge.
- **Point budget:** about two points per pixel of width, stepped by 400 so small resizes reuse the query. A "1,600 of 8,971 points" note shows when the result was downsampled.
- **Zoom:** while the chart is active, dragging box-zooms the time axis. That refetches the range at full resolution (`xRange`, session only). Double-click or "Reset zoom" returns to the full range.
- **Preview:** a PNG snapshot captured after each render.
- **Level of detail, decided:** previews switch on zoom level only, not during pan and zoom gestures. Vue Flow pans with a CSS transform, so live charts aren't re-rendered while panning, and remounting them after every gesture would cost more than it saves.
- Point-click and brush publishing are configured in the schema (`publish`, `publishTimeRange`) and wired in F10.

## F9: Wafer map component · L ✅

**Scope** (spec: [components.md](components.md#wafer-map))
- Canvas 2D renderer with DPR scaling, grid from x/y extents, fitted wafer outline and notch marker, orientation flips.
- Color scales (viridis, diverging, turbo), ranges (auto, p1–p99, fixed), legend bar.
- Hover tooltip by grid lookup (x, y, value, wafer, lot).
- Modes: single (with wafer picker), gallery (lazy-rendered thumbnails, paging past about 25 wafers, shared scale), stacked (per-die aggregate).
- `wafer` shape requests. Snapshot for preview.

**Done when:** a lot from the excursion window shows its 25 wafers in gallery mode with the edge ring visible on the chamber-C wafers. Stacked mode across those wafers shows the ring averaged.

**As built (`src/components/wafer-map/`):**
- **Drawing:** Canvas 2D at device pixel ratio, one cell per die, with a fitted outline and notch and optional die grid. Mirroring (x and y) replaces "orientation flips". Hover finds the die by grid lookup.
- **Colors:** a one-hue sequential blue scale or a blue ↔ gray ↔ red diverging scale (symmetric around a center, the median by default), per the dataviz rules. Viridis and Turbo from the original spec were dropped: rainbow scales distort perceived differences. The range is min–max, p1–p99 (default) or fixed, and values outside it are clamped and flagged in the legend. One scale is shared by all maps on screen, so wafers can be compared.
- **Modes:** *One wafer* (picker plus previous/next), *All wafers* (gallery of up to 25 per page, paged past that) and *Stacked* (per-die aggregate). Gallery tiles aren't lazy-rendered: the 25-per-page cap keeps the cost fixed (about 45k dies per page).
- **Selection:** clicking a wafer selects it (Shift / Ctrl / ⌘ adds), recorded in `canvasUi.rowSelections` as `{ wafer_id, lot_id }` for F10 publishing.
- **Required parameters:** datasets can mark "at least one of" params (`requiredGroup`). `wafer_dies` needs lots *or* wafers, and the component asks for them instead of showing an upstream error.
- **Mock:** the wafer shape carries `unit` for the legend.

## F10: Filters and cross-filtering · L ✅

**Scope** (spec: [data-layer.md](data-layer.md#filters), [canvas-ux.md](canvas-ux.md#filters))
- Dimension vocabulary from `GET /api/filters`. Value pickers (searchable multi-select with paste-a-list support, time range presets, number range).
- Filter bar (canvas scope) and group header filter chips.
- **Resolution engine:** component override → group session → group default → canvas session → canvas default → dimension default. Pure functions, exhaustively unit-tested.
- Bindings: auto-suggested from dataset `filter` hints, editable in the inspector. Footer shows the active bindings.
- **Publishing:** table row selection, chart point click and brush, and wafer click push into their scope. A component never filters itself on a dimension it publishes. Published chips show and highlight their source.
- Session vs saved: URL sync for canvas filters (`?f.lot_id=…`), "Save as default" (editor op), Reset.

**Done when** (★ demo milestone): starting from an empty canvas, a user builds the ET-03 investigation:
1. Canvas time range = last 30 days, tool = ET-03.
2. SPC chart of `CD_MEAN` shows the chamber-C excursion.
3. A lot table bound to `tool_id` lists the affected lots with low yield.
4. Selecting lots in the table updates a wafer-map gallery in the same group.
5. The URL reproduces the view in a new tab.

**As built (`src/filters/`, `stores/filters.ts`):**
- **Vocabulary:** the mock serves `GET /api/filters` (time range, tool, chamber, lot, wafer, product, parameter) and `/api/filters/{id}/values` from the dataset values.
- **Pickers:** a searchable multi-select where pasting a list adds every value, and time-range presets plus a custom range. Number ranges decode from URLs but have no picker yet: no dimension uses them.
- **Resolution** (`resolve.ts`) and **bindings** (`bindings.ts`) are pure functions with unit tests for each precedence level, self-exclusion and the weak dimension default (see data-layer.md).
- **Bindings:** every param with a `filter` hint follows its dimension by default. The inspector shows "Follows the Tool filter: ET-03 (canvas)" with Unlink/Link, stored as `config.bindings`. The component footer lists the filters applied right now.
- **Chips:** the filter bar (canvas) and group headers show session values, published values (dashed, "· source title"; hovering highlights the source and double-clicking brings it into view) and saved defaults (muted). Anyone, viewers included, can change session filters.
- **Publishing:** one watcher turns `canvasUi.rowSelections` into session filters in the component's scope (its group, else the canvas), per its `publish` rules. Sources:
  - table rows
  - chart point click (charts can also publish a box-zoomed time range with `publishTimeRange`)
  - wafer click

  A shared rules editor appears in each of those inspectors. Withdrawing a published chip clears the source's selection.
- **Session vs saved:**
  - Canvas session filters are mirrored in the URL (`?f.tool_id=ET-03&f.time_range=last_30d`; absolute ranges `start..end`).
  - "Save as default" is a `canvas.update` op, with undo, conflicts and sync like any edit; groups have `setGroupDefaultFilters` in the store.
  - Reset drops session values.
  - Seeds and new canvases no longer store a "last 7 days" default: the dimension default covers it.
- **Not yet:** group "Save as default" in the UI (store support only), per-component overrides UI (resolution supports `config.overrides`). A selection is withdrawn when its view unmounts (zooming out to previews).
## F11: Sharing and permissions UI · M ✅

**Scope** (spec: [permissions.md](permissions.md))
- Viewer mode: no palette, read-only inspector, no move or resize, "View only" badge, Duplicate to my canvases.
- Locked components (lock icon, no edits). Hidden components are absent (server-side). Restricted markers for owners and admins.
- Share dialog: user search (`/api/users`), roles, remove.
- "Restrict access…" dialog per component (view/edit flags, ACL).
- Graceful 403/404 handling everywhere.
- MSW enforces the full permission matrix. The dev user switcher makes each role testable.

**Done when:** a table-driven Playwright suite walks owner, editor, viewer, locked and hidden scenarios and matches the "Who can do what" table.

**As built:**
- **Mock:** `GET /api/users`, `GET`/`PUT /api/canvases/{id}/shares` and `GET`/`PUT …/components/{cid}/access`, owner and admin only. They validate known users and roles. An access change bumps the component version, and the client picks it up through the normal remote merge. Seeds (DB v7): the CMP canvas (owner m.park, k.lee editor) has a view-restricted "Supplier notes".
- **Top bar:**
  - A role badge: Owner / Editor / View only / Admin access.
  - Owners and admins get **Share**; viewers get **Duplicate to my canvases**.
  - The canvas menu has Share…, Rename, Duplicate (labelled "to my canvases" for non-owners) and Delete, shown per role.
- **Share dialog:** user search, Can edit / Can view per person, remove, and Save (replaces the list).
- **Restrict access… dialog** (component menu, owner and admins): "Hide from everyone not listed" and "Only listed people can edit" checkboxes, a plain-language summary, and an ACL with view/edit per person. On the canvas, hidden components show an eye-off marker to the people who can still see them. Locked ones keep the lock and "view only" marker.
- **Suite** (`e2e/permissions.spec.ts`): a table of owner, admin, editor, editor-with-a-hidden-component and viewer cases. Each checks the badge, visible components, palette and undo, Share, the duplicate entry, the menu, and that session filters work. Flows cover sharing (a new viewer, a role change), hiding and an ACL, locking and duplicating as a viewer. The existing canvas specs cover dragging and deleting locked components and no-access (404).
- **Not yet:** a user's own access list, and explaining *why* something is locked beyond the tooltip.

## F12: Admin screens · L ✅

**Scope** (spec: [admin.md](admin.md))
- Admin layout and navigation. Route guard.
- **Permissions:** admins list (add, remove, bootstrap marker), canvas browser (search, owner filter, show deleted, open as admin, manage access, transfer, delete or restore), user access lookup with bulk actions.
- **Usage:** overview tiles and charts, per-dataset table and detail, slow queries, errors. Time range selector. Reuses the F8 ECharts setup.
- **Health:** live status cards with 30 s refresh.
- **Audit log:** filterable list.
- MSW fixtures generate plausible usage and health data until the backend provides it.

**Done when:** every page in [admin.md](admin.md) works against MSW, including empty and error states.

**As built (`src/pages/admin/`, `src/api/admin.ts`, `src/mocks/handlers/admin.ts`):**
- **Layout:** `/admin/*` child routes, admin-guarded, with a left nav (Permissions / Usage / System); it stacks on narrow screens. The time range (`?range=`) and filters live in the URL and carry over between pages.
- **Admins:** bootstrap admins are marked "from config" and can't be removed. Grant through user search; revoke with confirmation. The mock refuses removing the last granted admin (yourself) and config admins.
- **Canvases:** search, owner filter, show deleted. Row actions:
  - Open
  - Manage access (the F11 share dialog)
  - Transfer ownership, optionally keeping the previous owner as an editor
  - Delete or Restore

  An editor banner reads "Viewing as admin" when access comes only from admin rights.
- **User access:** owned and shared canvases, ACL entries, and components hidden from the person. Bulk actions: remove all shares, and transfer all owned canvases.
- **Usage:**
  - Overview: six tiles; queries per hour and errors per hour as *two* charts (never two y-axes); active users per day; component mix; top canvases.
  - Datasets: a sortable table, with a detail page (p50/p95 latency, errors by code, slowest calls, canvases using it).
  - Slow queries (threshold) and errors (by code).
- **Health:** status cards (icon, label and color) for the data API, PostgreSQL, the cache, concurrency and the app, plus a 24 h check-history chart, refreshed every 30 s. The data API card **really calls** the mock data API's `/health`.
- **Audit log:**
  - Filterable by person, action and range.
  - The mock audits shares, ACL changes, canvas delete/restore/transfer, admin grant/revoke and bulk user actions.
- **Fixtures** (`src/mocks/usage.ts`): deterministic and hash-based, with a planted data API outage 3 days ago, 14:00–15:00, that shows up in errors, latency and health. `localStorage['mock.adminFail'] = '<path part>'` simulates failures, for the error states.
- **Empty and error states:** a shared `AdminState` component (skeleton, error with Retry, empty), exercised in e2e.
- **Not yet:** restricted-component ACL editing inside Manage access (open the canvas instead), and the read-only dataset and filter lists from admin.md "Later".

## F13: Hardening · M ✅

**Scope**
- **Performance:** a benchmark canvas (30+ data components and 100 notes). Profile pan and zoom (target about 60 fps), memory, and query fan-out. Tune LOD thresholds and debounce.
- **Accessibility:** keyboard paths for palette, inspector, dialogs and filter bar. Focus management. Color-blind-safe palettes checked.
- **End-to-end:** a Playwright test of the full demo script (F10 done criteria) running in CI against MSW and the mock data API.
- Error boundary per component (one broken component never breaks the canvas).
- Switch from MSW to the real FastAPI for whatever endpoints exist by then. Generate types from OpenAPI.
- User-facing help: shortcut cheat sheet (`?`), first-run hints.

**Done when:** the benchmark meets targets and the e2e demo test is green.

**As built:**
- **Benchmark:** "Benchmark canvas (dev)" on the home page generates a canvas: 6 groups × 6 data components (SPC and trend charts, lot tables, stacked wafer maps) plus 100 notes. `npm run bench` (`e2e/bench.spec.ts`, tagged `@bench`, outside the normal run) measures it. Headless Chromium, dev build, 1600×1000:

  | Measure | Result | Target |
  | --- | --: | --: |
  | Open the canvas until all 136 components are loaded | 1.3 s | — |
  | `/api/query` calls at fit-all (data components show previews) | 0 | ≤ 6 |
  | Calls after zooming to one group (12 components drawn) | 12 | ≤ 2 per drawn component |
  | Panning, fit-all | 60 fps | ~60 |
  | Panning at 100% over a group of charts, tables and maps | 60 fps | ~60 |
  | Zooming in and out | ≥ 60 fps | ~60 |
  | JS heap after the run (dev build) | ~190 MB | — |

  Existing LOD thresholds and the 250 ms query debounce held up, so neither was retuned.
- **Bundle:** table, chart and data-preview views (with AG Grid and ECharts) load on first use (`registry/lazy.ts`), and the table inspector no longer pulls AG Grid. The editor chunk went from 1,765 kB (518 kB gzipped) to 754 kB (232 kB); AG Grid (956 kB) and ECharts (617 kB) are lazy chunks. Arrow was already lazy.
- **Accessibility:** `e2e/a11y.spec.ts` runs axe (WCAG 2 A/AA) on home, the canvas, an empty canvas with tips, three admin pages and two dialogs, in light *and* dark mode. Any serious or critical violation fails it. Fixes made along the way:
  - Decorative icons are `aria-hidden`.
  - The info-tag and menu-group colors were darkened to reach 4.5:1.
  - Links are themed, so they're readable in dark mode.
  - Task-list checkboxes and search inputs inside selects are labeled, and so is the cache progress bar.
  - Admin cards use real headings.
  - A small patch (`app/a11yFixes.ts`) adds the missing `aria-level` on Naive UI's dialog card headers.

  Keyboard paths are tested: palette → Enter adds a component; the filter bar → add filter → arrow keys → the value picker gets focus → type and Enter. The category palette was already validated in F8.
- **End-to-end demo:** the F10 ★ test runs in CI against MSW and the mock data API.
- **Error boundary:** per component (since F4), now covered by e2e. A dev-only hook (`window.__crashComponents`) makes a component throw; the canvas and its neighbours keep working, and Retry recovers.
- **Help:** a `?` cheat sheet generated from the registered shortcuts, with groups, key caps and mouse gestures, and a button by the zoom controls. First-run tips appear on empty canvases.
- **Not done (needs the real backend):** switching from MSW to FastAPI endpoints and generating types from its OpenAPI. Both wait until FastAPI exists. The handoff points are in "Sequencing notes" below.

---

## Sequencing notes

- **Critical path to the demo** is F0 → F4 → F6 → (F7, F8, F9) → F10. F5 (groups) must land before F10 because group filters depend on it.
- **F7, F8 and F9 are independent** once F6 is done and can be built in any order or in parallel. F7 comes first because the lot table is the easiest way to drive publishing in F10.
- **Admin (F12)** was named a priority. It depends on F1 (shell) and only lightly on the canvas (open as admin, manage access reuses F11 dialogs). It could move up to right after F4 if the admin story should be demoable before the data story. Usage pages need real query logs to be meaningful, so those stay late or use fixtures.
- **Backend handoff points:** each milestone lists the api.md endpoints it uses. When the matching FastAPI endpoints exist, replace the MSW handler for that milestone. Recommended backend order to match: `me` and canvases/ops (F1–F5) → datasets/query (F6–F9) → filters (F10) → shares/ACL (F11) → admin (F12).

## Endpoint usage by milestone

| Milestone | Endpoints |
| --- | --- |
| F1 | `GET /me`, `GET/POST /canvases`, `DELETE /canvases/{id}`, `POST /canvases/{id}/duplicate` |
| F4–F5 | `GET /canvases/{id}`, `POST /canvases/{id}/ops` |
| F6–F9 | `GET /datasets`, `GET /datasets/{id}/values/{param}`, `POST /query` |
| F10 | `GET /filters`, `GET /filters/{id}/values` |
| F11 | `GET /users`, `GET/PUT /canvases/{id}/shares`, `GET/PUT /canvases/{id}/components/{cid}/access` |
| F12 | `/admin/*` |
