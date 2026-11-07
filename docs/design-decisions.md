# Design decisions

A running log of significant decisions. Each entry records the context, the choice, the alternatives considered and the consequences.

**Status:** **Accepted** = agreed with the project owner. **Proposed** = recommended, not yet confirmed. **Superseded** = replaced by a later entry.

| # | Decision | Status |
| --- | --- | --- |
| DD-001 | Vue 3 + TypeScript + Vite + Pinia | Accepted (Vue) / Proposed (TS) |
| DD-002 | Vue Flow as the canvas engine | Proposed |
| DD-003 | Shared filter scopes instead of wired edges | Accepted |
| DD-004 | FastAPI as the only backend the browser talks to | Accepted |
| DD-005 | Data only through fixed endpoints on the internal data API | Accepted |
| DD-006 | Datasets and filter dimensions defined as code (YAML) | Accepted |
| DD-007 | Server-side shaping for large data | Proposed |
| DD-008 | Level-of-detail rendering on the canvas | Proposed |
| DD-009 | Identity from `x-knox-id`, no auth in the app | Accepted |
| DD-010 | Canvas sharing plus per-component restrictions | Accepted |
| DD-011 | Normalized canvas storage with ops-based saves | Proposed |
| DD-012 | No data-level security in v1 | Proposed |
| DD-013 | Filters are session state; saved defaults are explicit | Proposed |
| DD-014 | Charts: ECharts · Tables: AG Grid Community · Wafer maps: custom Canvas 2D | Proposed |
| DD-015 | UI kit: PrimeVue | Proposed |
| DD-016 | TanStack Query for server data on the client | Proposed |
| DD-017 | In-process caching first, Redis later | Proposed |
| DD-018 | Query and audit logging in PostgreSQL | Proposed |
| DD-019 | Monorepo with a mock data API | Accepted |
| DD-020 | Admin screen early: permissions and usage first | Accepted |
| DD-021 | Frontend built contract-first against MSW until FastAPI exists | Proposed |

---

## DD-001: Vue 3 with TypeScript

**Context:** The project owner chose Vue. The app has a complex model (canvases, groups, components, filters, permissions) shared across many modules, and a backend owned by someone else.

**Decision:** Vue 3 (Composition API, `<script setup>`), TypeScript, Vite, Pinia, vue-router. API types are generated from FastAPI's OpenAPI schema.

**Consequences:** contract changes on the backend show up as frontend type errors at build time instead of runtime bugs.

---

## DD-002: Vue Flow as the canvas engine

**Context:** We need an infinite canvas with pan, zoom, selection, minimap and grouping, where nodes hold rich, interactive content. n8n's editor is built on Vue Flow.

**Decision:** Vue Flow (`@vue-flow/core` with its minimap, controls and background packages).

**Alternatives:**

| Option | Why not |
| --- | --- |
| Custom pan/zoom with CSS transforms | We'd rebuild selection, drag, snapping, minimap and parent nodes ourselves |
| Konva / vue-konva, PixiJS | `<canvas>` rendering. Embedding interactive DOM (grids, chart tooltips, forms) is awkward |
| tldraw, Excalidraw | React-based. Built for whiteboarding, not data-heavy nodes in a Vue app |

**Consequences:** any Vue component works inside a node. Heavy nodes need level-of-detail rendering (DD-008). Edges are available if wiring is added later.

---

## DD-003: Shared filter scopes instead of wired edges

**Decision:** Linking happens only through filter scopes (canvas → group → component) with bindings and publishing. No drawn edges in v1.

**Consequences:** a simple mental model ("everything in this group is about ET-04"). Groups double as the linking boundary. The filter vocabulary must be consistent across datasets (DD-006). Edges can be added later without changing the filter engine.

---

## DD-004: FastAPI as the only backend the browser talks to

**Context:** The project owner builds the backend in FastAPI. FastAPI also owns all PostgreSQL access.

**Decision:** Every browser request goes to FastAPI under `/api`. FastAPI is both the CRUD API for app state and the backend-for-frontend for data.

**Consequences:** one place for permissions, logging, caching and shaping. No CORS or credentials in the browser for other services.

---

## DD-005: Data only through fixed endpoints on the internal data API

**Context:** An existing internal API already fronts Iceberg (through Trino), external databases and DynamoDB. It exposes fixed endpoints.

**Decision:** FastAPI calls those endpoints with an httpx client (timeouts, retries, concurrency cap, coalescing). FastAPI holds no connections to fab data stores and sends no SQL.

**Consequences:**
- Data access is only as flexible as the data API's endpoints. New data needs may require new endpoints from its owners.
- Large results arrive as full payloads that FastAPI must shape. If the data API can aggregate, page or limit, use that (see open questions).

---

## DD-006: Datasets and filter dimensions defined as code

**Context:** The admin (the project owner) defines datasets and also writes the backend. The admin screen priorities are permissions and usage, not dataset editing.

**Decision:** Datasets live as YAML files in `backend/config/datasets/`, and filter dimensions in `backend/config/filters.yaml`. Both are validated by Pydantic at startup and in CI, with an optional Python transform hook per dataset.

**Alternatives:** datasets stored in the DB and edited in an admin UI (deferred; more UI, less reviewable); ad-hoc queries by users (not possible with fixed endpoints, and not wanted).

**Consequences:** dataset changes are reviewed and versioned in git and need a deploy. A read-only dataset view and test runner in the admin UI come later.

---

## DD-007: Server-side shaping for large data

**Context:** Department scale, with components backed by millions of rows.

**Decision:** Components request a shape (`timeseries`, `scatter`, `histogram`, `boxplot`, `table`, `wafer`, `distinct`). FastAPI computes it with Polars (LTTB, binning, quartiles, paging, per-die aggregation). Large results can be sent as Arrow IPC.

**Consequences:** small payloads and fast rendering. Chart zoom refetches a narrower range at higher resolution. CSV export needs a separate unshaped endpoint.

---

## DD-008: Level-of-detail rendering on the canvas

**Decision:** Every component type has a `preview` view, used when zoomed out, during pan or zoom gestures, and for components off-screen (which aren't mounted at all).

**Consequences:** smooth navigation with many heavy components. Components must cope with unmounting and remounting. Data stays in the client query cache, so remounting is cheap.

---

## DD-009: Identity from `x-knox-id`, no auth in the app

**Decision:** The upstream gateway authenticates. FastAPI reads `x-knox-id` on every request, upserts the user, and returns 401 if it's missing. FastAPI must be reachable only through the gateway, with an optional trusted-proxy CIDR check. `DEV_KNOX_ID` is for local development only.

**Consequences:** no credentials handled. Display names and group membership aren't available unless a directory lookup exists (see open questions).

---

## DD-010: Canvas sharing plus per-component restrictions

**Context:** The owner wants control over whether a user can view a specific component and whether they can write to it.

**Decision:**
- Canvas roles: owner, editor, viewer, plus app-wide admin.
- Each component can be `view_restricted` and/or `edit_restricted` with a Knox ID ACL.
- Restrictions only narrow canvas access.
- Hidden components are never sent to the client.
- Only owners and admins manage access.

**Alternatives:** canvas-level permissions only (simpler, but doesn't meet the requirement); per-dataset permissions (a different problem, DD-012).

**Consequences:** permission logic must be checked per component on every read and write, which drives the storage model (DD-011). Rules are specified in [permissions.md](permissions.md) and should be covered by table-driven tests.

---

## DD-011: Normalized canvas storage with ops-based saves

**Context:** With per-component permissions, saving the whole canvas as one JSON document doesn't work. A user who can't see some components can't send a complete document, and the server would have to diff it to check what changed. Concurrent editors would also overwrite each other's unrelated changes.

**Decision:**
- Canvases, groups and components are rows in PostgreSQL. Component `config` is JSONB.
- The client sends batches of operations (`component.create/update/delete`, `group.*`, `canvas.update`) to `POST /api/canvases/{id}/ops`.
- Each op carries the entity's `version` for optimistic locking.
- The server checks permissions per op and applies each batch atomically.

**Supersedes:** the earlier single-JSONB-document proposal.

**Alternatives:** whole-document saves with server-side diffing (fragile with hidden components); CRDT/Yjs real-time sync (needed only for live co-editing, out of scope).

**Consequences:** conflicts are per component, so two editors working on different components never collide. Undo and redo are built on ops and their inverses. A `revision` counter enables change polling later.

---

## DD-012: No data-level security in v1

**Context:** The owner asked for basic security around components, not data.

**Decision:** Any authenticated user can query any dataset. Component restrictions control what appears on canvases, not what data a user may fetch.

**Alternatives:** dataset-level ACLs (`dataset_acl` table checked in `/api/query`) as a later extension; enforcement inside the internal data API by forwarding `x-knox-id`.

**Consequences:** simple. Must be clearly communicated so restrictions aren't mistaken for data protection.

---

## DD-013: Filters are session state; saved defaults are explicit

**Context:** Viewers need to explore (change lots, time ranges) without editing the canvas, and editors shouldn't accidentally overwrite shared defaults while investigating.

**Decision:**
- Filter changes affect only the current session and, for canvas-level filters, the URL.
- Editors explicitly "Save as default" to persist canvas or group filters.
- Relative time ranges stay relative.

**Consequences:** sharing a link reproduces the exact filtered view. Saved canvases don't drift from investigation clicks.

---

## DD-014: Charts with ECharts, tables with AG Grid Community, custom wafer maps

**Charts: Apache ECharts** (`vue-echarts`). It covers line, scatter, histogram, box plot and SPC styling (mark lines, areas, visual maps), handles large series with canvas rendering and progressive mode, and is free. *Alternatives:* Plotly (heavy, slower across many instances), uPlot (fast, time series only), Highcharts (licensed).

**Tables: AG Grid Community** with the infinite row model, which gives virtualization, sorting, filtering, column management and server paging in the free edition. *Alternatives:* TanStack Table with a virtualizer (more to build), AG Grid Enterprise (licensed; revisit for grouping or pivoting).

**Wafer maps: custom Canvas 2D.** Wafer maps are domain-specific (die grid, notch orientation, outline, gallery and stacked modes) and generic heatmaps fit poorly. Canvas 2D handles about 50k dies comfortably. WebGL is an upgrade path for very large galleries.

---

## DD-015: UI kit: PrimeVue

**Decision:** PrimeVue (styled mode with a custom theme) for dialogs, menus, forms, multi-selects, date pickers, toasts and the admin tables.

**Why:** broad, data-oriented component set, including a good multi-select with virtual scroll and a date-range picker, which the filter bar needs. Actively maintained for Vue 3.

**Alternatives:** Naive UI (good, smaller ecosystem), Vuetify (Material look, heavier), headless (Radix Vue + Tailwind; most flexible, most work).

---

## DD-016: TanStack Query for server data on the client

**Decision:** Use `@tanstack/vue-query` for all data fetching: canvas lists, datasets and `/api/query` results.

**Why:** request deduplication (many components with identical queries), caching across unmount and remount (needed by DD-008), stale-while-revalidate, retries and refetch on focus come built in.

**Consequences:** component query keys are derived from `(dataset, effective params, shape)`, so filter changes naturally trigger refetches and identical components share results.

---

## DD-017: In-process caching first, Redis later

**Decision:** An in-process, memory-capped LRU cache for raw DataFrames and shaped responses, with per-dataset TTL and request coalescing. One async uvicorn process to start.

**Consequences:** no extra infrastructure in v1. Moving to several workers or replicas means adding Redis for the shaped cache (and optionally raw frames as Arrow bytes). The cache interface is abstracted to make that swap local.

---

## DD-018: Query and audit logging in PostgreSQL

**Decision:** `query_log` (one row per `/api/query`, written asynchronously in batches, 90-day retention) and `audit_log` (permission and ownership changes) tables in the app DB. The admin usage pages are SQL aggregations over `query_log`.

**Alternatives:** Prometheus and Grafana or an external log platform (good for ops, but the admin wanted these views inside the app). Both can coexist later.

---

## DD-019: Monorepo with a mock data API

**Decision:** `frontend/`, `backend/`, `mock-data-api/` and `docs/` in one repo, with docker-compose running postgres, backend and the mock API.

**Why:** frontend work and demos can't depend on access to production data. The mock API, serving generated SPC, lot and wafer data in the same response format as the real API, also gives deterministic test data.

**Update:** this build is a demo with no access to the real API, so the mock is the only data source. It is implemented in Python (FastAPI + NumPy) and generates everything from one fab model with hash-based values, so all endpoints agree with each other, filtered queries are exact subsets, and a planted excursion (ET-03 chamber C) gives cross-filtering something real to find. See [mock-data-api.md](mock-data-api.md).

---

## DD-020: Admin screen early, permissions and usage first

**Decision:** The admin screen is roadmap phase 3, with usage and health completed in phase 4 once query logging exists. v1 contents: admins, canvas browser, ownership transfer, access management, user access lookup, usage overview, per-dataset stats, slow queries and errors, health, audit log. Dataset and filter views come later and are read-only (DD-006).

---

## DD-021: Frontend built contract-first against MSW until FastAPI exists

**Context:** The FastAPI backend is built separately and doesn't exist yet. The frontend shouldn't wait for it.

**Decision:** The frontend implements [api.md](api.md) against Mock Service Worker handlers (in-memory store persisted to localStorage, with the permission rules enforced). The `/api/query` handler calls the local mock data API and applies simple JS shaping. A `VITE_API_MOCK` flag switches between MSW and the real backend through the Vite proxy. Handlers are removed per endpoint group as the backend catches up.

**Alternatives:** wait for the backend (blocks the frontend); build a throwaway Node backend (more work than MSW, and it would diverge from the FastAPI implementation).

**Consequences:** frontend work can start immediately, and the contract is exercised early. Contract drift is a risk until types are generated from OpenAPI, so the mock must follow api.md strictly, and api.md changes are agreed before either side implements them.
