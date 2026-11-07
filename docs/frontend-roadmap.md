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

## F2: Canvas core · M

**Scope**
- Vue Flow canvas with background dot grid, minimap and zoom controls. Zoom range 10–200%.
- Pan (empty-canvas drag, Space+drag, middle mouse, trackpad) and zoom (Ctrl+wheel, pinch, `+`/`-`, fit, reset).
- Selection: click, Shift+click, Shift+drag box, Ctrl+A. Move by drag and arrow-key nudge. Resize with min sizes. 16 px snap (Alt to disable). Z-order `[` `]`.
- Central shortcut registry (scoped so shortcuts don't fire inside inputs) and right-click context menu.
- Viewport persisted per canvas in localStorage.
- Placeholder nodes (plain boxes) to exercise all of the above.

**Done when:** 50 placeholder nodes can be panned, zoomed, selected, moved and resized smoothly. The viewport is restored on reload.

## F3: Component framework and Note · M

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

## F4: Document model, undo/redo, persistence · L

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

## F5: Groups · M

**Scope**
- Create from selection (Ctrl+G), ungroup (Ctrl+Shift+G). Groups are Vue Flow parent nodes.
- Group header: rename, collapse/expand (children unmounted when collapsed), menu.
- Drag components in and out of groups (membership change with position conversion).
- Delete group: "ungroup" vs "with contents" (respecting `CONTAINS_UNEDITABLE`).
- All group edits are ops with inverses.

**Done when:** groups behave per [canvas-ux.md](canvas-ux.md#groups), including undo and persistence.

## F6: Data foundation · M

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

## F7: Table component · M

**Scope** (spec: [components.md](components.md#table))
- AG Grid Community, infinite row model, `table` shape (offset, limit, sort, column filters).
- Column chooser, reorder, resize and pin, saved in config by editors and session-only for viewers.
- Number formats, total row count footer, copy as TSV.
- Row selection (single or multi). Publish rules are configured in the inspector; the actual publishing is wired in F10.
- Preview: header plus first rows snapshot.

**Done when:** the `lots` dataset (7 days, about 300 lots) and `spc_points` site data (about 100k rows) scroll smoothly with server-side sort and filter.

## F8: Chart component · L

**Scope** (spec: [components.md](components.md#chart))
- ECharts via `vue-echarts`. Tree-shaken imports. A theme matching the app tokens.
- Kinds: line/trend (`timeseries`), scatter, histogram, box plot, SPC.
- SPC: UCL/LCL/target/USL/LSL as step lines, beyond-limits highlighting, "N OOC" badge.
- Point budget derived from component width. Box zoom refetches the zoomed x-range. Double-click resets.
- Tooltips from the dataset `tooltip` columns. Series split (`seriesBy`), legend.
- Snapshot capture (`getDataURL`) for the LOD preview.
- Inspector: kind-specific config (x, y, seriesBy, limits mapping, rules).

**Done when:** `CD_MEAN` for ET-03 over 30 days renders as an SPC chart split by chamber, and the chamber-C excursion stands out with OOC points highlighted.

## F9: Wafer map component · L

**Scope** (spec: [components.md](components.md#wafer-map))
- Canvas 2D renderer with DPR scaling, grid from x/y extents, fitted wafer outline and notch marker, orientation flips.
- Color scales (viridis, diverging, turbo), ranges (auto, p1–p99, fixed), legend bar.
- Hover tooltip by grid lookup (x, y, value, wafer, lot).
- Modes: single (with wafer picker), gallery (lazy-rendered thumbnails, paging past about 25 wafers, shared scale), stacked (per-die aggregate).
- `wafer` shape requests. Snapshot for preview.

**Done when:** a lot from the excursion window shows its 25 wafers in gallery mode with the edge ring visible on the chamber-C wafers. Stacked mode across those wafers shows the ring averaged.

## F10: Filters and cross-filtering · L

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

## F11: Sharing and permissions UI · M

**Scope** (spec: [permissions.md](permissions.md))
- Viewer mode: no palette, read-only inspector, no move or resize, "View only" badge, Duplicate to my canvases.
- Locked components (lock icon, no edits). Hidden components are absent (server-side). Restricted markers for owners and admins.
- Share dialog: user search (`/api/users`), roles, remove.
- "Restrict access…" dialog per component (view/edit flags, ACL).
- Graceful 403/404 handling everywhere.
- MSW enforces the full permission matrix. The dev user switcher makes each role testable.

**Done when:** a table-driven Playwright suite walks owner, editor, viewer, locked and hidden scenarios and matches the "Who can do what" table.

## F12: Admin screens · L

**Scope** (spec: [admin.md](admin.md))
- Admin layout and navigation. Route guard.
- **Permissions:** admins list (add, remove, bootstrap marker), canvas browser (search, owner filter, show deleted, open as admin, manage access, transfer, delete or restore), user access lookup with bulk actions.
- **Usage:** overview tiles and charts, per-dataset table and detail, slow queries, errors. Time range selector. Reuses the F8 ECharts setup.
- **Health:** live status cards with 30 s refresh.
- **Audit log:** filterable list.
- MSW fixtures generate plausible usage and health data until the backend provides it.

**Done when:** every page in [admin.md](admin.md) works against MSW, including empty and error states.

## F13: Hardening · M

**Scope**
- **Performance:** a benchmark canvas (30+ data components and 100 notes). Profile pan and zoom (target about 60 fps), memory, and query fan-out. Tune LOD thresholds and debounce.
- **Accessibility:** keyboard paths for palette, inspector, dialogs and filter bar. Focus management. Color-blind-safe palettes checked.
- **End-to-end:** a Playwright test of the full demo script (F10 done criteria) running in CI against MSW and the mock data API.
- Error boundary per component (one broken component never breaks the canvas).
- Switch from MSW to the real FastAPI for whatever endpoints exist by then. Generate types from OpenAPI.
- User-facing help: shortcut cheat sheet (`?`), first-run hints.

**Done when:** the benchmark meets targets and the e2e demo test is green.

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
