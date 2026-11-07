# Architecture

## System overview

```
                 ┌────────────────────────────────────────────────┐
 Browser         │  Vue 3 SPA                                     │
                 │  Canvas (Vue Flow) · Component registry        │
                 │  Pinia stores · Filter engine · Query client   │
                 └───────────────────────┬────────────────────────┘
                                         │ HTTPS · /api/*  (JSON; Arrow for large results)
                 ┌───────────────────────▼────────────────────────┐
 Upstream auth   │  Existing gateway / auth layer (not ours)      │
                 │  Authenticates user, sets  x-knox-id           │
                 └───────────────────────┬────────────────────────┘
                 ┌───────────────────────▼────────────────────────┐
 Backend         │  FastAPI  (built by project owner)             │
                 │  Identity · Canvas & permission API · Admin API│
                 │  Dataset registry · Query + shaping · Cache    │
                 │  Data API client · Query log                   │
                 └───────────┬─────────────────────────┬──────────┘
                             │ SQLAlchemy              │ HTTP (fixed endpoints)
                 ┌───────────▼──────────┐   ┌──────────▼──────────────────────┐
                 │ PostgreSQL (app DB)  │   │ Internal data API (existing)    │
                 │ users, admins,       │   │  ├─ Trino → Iceberg tables      │
                 │ canvases, groups,    │   │  ├─ external databases          │
                 │ components, ACLs,    │   │  └─ DynamoDB                    │
                 │ query log, audit log │   └─────────────────────────────────┘
                 └──────────────────────┘
```

Principles:

1. **The browser talks only to FastAPI.** Every read and write goes through FastAPI CRUD endpoints under `/api`.
2. **FastAPI never talks to fab data stores directly.** It calls fixed endpoints on the internal data API, described by datasets. Trino, Iceberg, DynamoDB and the external databases sit behind that API.
3. **FastAPI owns PostgreSQL** for all app state: canvases, components, permissions, logs.
4. **Identity is given, not established.** The upstream layer authenticates. FastAPI reads `x-knox-id`.
5. **Permissions are enforced on the server.** The frontend uses access flags only to adjust the UI.

## Repository layout

```
vue-canvas-app/
├── frontend/                Vue 3 + TypeScript + Vite
├── backend/                 Python 3.12 + FastAPI
│   └── config/
│       ├── datasets/        One YAML file per dataset
│       └── filters.yaml     Filter dimension vocabulary
├── mock-data-api/           Small FastAPI app mimicking the internal data API with sample data
├── docs/
└── docker-compose.yml       postgres + backend + mock-data-api (+ frontend dev server)
```

The **mock data API** lets frontend and backend be developed and demoed without access to the real data API, and gives tests deterministic data.

## Frontend

### Stack

| Concern | Choice |
| --- | --- |
| Framework | Vue 3, Composition API, `<script setup>`, TypeScript, Vite |
| Routing and state | vue-router, Pinia |
| Canvas | Vue Flow (`@vue-flow/core`, minimap, controls, background) |
| Server data | TanStack Query for Vue (caching, dedupe, retries, stale-while-revalidate) |
| API types | Generated from FastAPI's OpenAPI schema (`openapi-typescript`) |
| Charts | Apache ECharts via `vue-echarts` |
| Tables | AG Grid Community, infinite row model |
| Wafer maps | Custom Canvas 2D component |
| Notes | `markdown-it` + DOMPurify |
| Validation | Zod (component configs) |
| Large payloads | `apache-arrow` (decoding Arrow IPC) |
| UI kit | Naive UI (DD-015) |

Reasoning for each is in [design-decisions.md](design-decisions.md).

### Modules

```
frontend/src/
├── app/            App shell, router, layout, error boundary
├── pages/          Home (canvas list), CanvasEditor, Admin/*
├── canvas/         Vue Flow setup, viewport, selection, grouping, LOD, shortcuts, clipboard
├── components/     Component types, one folder each: chart/, wafer-map/, table/, note/
├── registry/       Component registry and palette metadata
├── filters/        Dimension vocabulary, scopes, resolution, filter bar, URL sync
├── data/           Query hooks, shape builders, Arrow/JSON decoding
├── stores/         canvasDoc (components, groups), history (undo/redo), session (filters, viewport), me
├── sync/           Ops queue: batches local edits into /ops calls, handles conflicts
├── api/            Generated types + thin fetch wrapper
└── ui/             Inspector, dialogs (share, restrictions), panels, toasts
```

### Component registry

Every component type registers a definition. The palette, the inspector, the canvas renderer and validation of saved configs are all driven from the registry. Adding a new type means one folder and one registration call.

```ts
interface ComponentDefinition<Config> {
  type: string                               // "chart" | "wafer-map" | "table" | "note"
  label: string
  icon: string
  defaultSize: { w: number; h: number }
  minSize: { w: number; h: number }
  configSchema: ZodType<Config>              // validates saved config, drives inspector forms
  configVersion: number                      // bump + migrate when the config shape changes
  migrateConfig?: (old: unknown, fromVersion: number) => Config
  defaultConfig: () => Config
  bindings?: (config: Config) => Binding[]   // filter dimensions → dataset params
  publishes?: (config: Config) => Publish[]  // selections this component can push to its scope
  view: Component                            // full interactive view
  preview: Component                         // cheap view for zoomed-out or off-screen rendering
  inspector?: Component                      // custom inspector, if the schema-driven form isn't enough
}
```

### Canvas rendering

- Vue Flow renders each component as a DOM node inside a transformed viewport, so ECharts, AG Grid and forms work as ordinary Vue components.
- Groups are Vue Flow parent nodes. Child positions are relative to the group.
- **Level of detail:** below a zoom threshold (about 0.5), or while a pan or zoom gesture is in progress, components render their `preview`. Off-screen nodes are not mounted (Vue Flow's visible-elements-only option).
- Data for an unmounted component stays in the TanStack Query cache, so remounting is instant.

### Client state

| Store | Holds | Persisted |
| --- | --- | --- |
| `canvasDoc` | Canvas meta, groups, components, each with `version` and `access` | Server, via ops |
| `history` | Undo and redo stacks of ops (each with its inverse) | No |
| `session` | Session filter overrides, selection, active component | Canvas-level filters in the URL. Viewport in localStorage per canvas |
| `me` | Knox ID, display name, `isAdmin` | No |

## Backend

### Stack

Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2 (async) with asyncpg, Alembic, httpx (data API client), Polars (shaping), PyArrow (Arrow IPC), uvicorn.

### Modules

```
backend/app/
├── main.py           App factory, middleware (identity, request ID, timing)
├── identity/         x-knox-id parsing, user upsert, admin check, dev override
├── canvases/         Canvas CRUD, ops application, versioning, duplication
├── permissions/      Effective-access computation, ACL CRUD, response filtering
├── datasets/         YAML loading and validation, dataset registry, param resolution
├── filters/          Filter dimension vocabulary, distinct-values lookups
├── dataapi/          httpx client: auth, timeouts, retries, concurrency limit, health check
├── query/            Pipeline: validate → cache → fetch → shape → serialize; request coalescing
├── shaping/          timeseries (LTTB), scatter, histogram, boxplot, table paging, wafer, distinct
├── admin/            Admin endpoints: admins, canvases, transfer, access lookup, usage, health
├── logging/          Query log and audit log writers, retention job
└── db/               Models, sessions, migrations
```

## Key flows

### Open a canvas

```
GET /api/canvases/{id}
  → identity middleware resolves knox_id
  → load canvas, shares, groups, components, component ACLs
  → compute effective access; 404 if the user can't view the canvas
  → drop components the user can't view; attach access flags to the rest
  → respond
Frontend: hydrate canvasDoc, apply URL filters, restore viewport, mount visible components
```

### Change a filter

```
user picks lot in filter bar (or selects rows in a table that publishes lot_id)
  → session store updates the scope's override (canvas or group)
  → each component in scope recomputes effective params from its bindings
  → components whose query key changed refetch (debounced 250 ms, deduped by TanStack Query)
  → POST /api/query { dataset, params, shape, context }
  → backend: cache hit → respond fast; miss → coalesce identical in-flight calls → data API → shape → respond
```

Session filter changes are not saved. Editors can choose "Save filters as default", which sends a `canvas.update` or `group.update` op.

### Edit a component

```
user drags, resizes or changes config
  → canvasDoc updated optimistically; inverse op pushed to history
  → sync queue coalesces edits (e.g. many drag moves → one position update) and flushes ~1 s after the last change
  → POST /api/canvases/{id}/ops { ops: [...] }   (each op carries the entity's current version)
  → backend checks permission per op, applies the whole batch in one transaction
      ok       → new versions returned, store updated
      conflict → 409 with current server state for the conflicting entities; UI offers to keep theirs or reapply mine
      denied   → 403; local change rolled back with a toast
```

## Data model (PostgreSQL)

```
users              knox_id PK, display_name, first_seen, last_seen
admins             knox_id PK → users, granted_by, granted_at

canvases           id uuid PK, owner_id → users, title, description,
                   default_filters jsonb, revision int, version int,
                   created_at, updated_at, deleted_at
canvas_shares      canvas_id → canvases, knox_id → users, role (viewer|editor),
                   granted_by, granted_at          PK (canvas_id, knox_id)

canvas_groups      id uuid PK, canvas_id → canvases, title, x, y, w, h, collapsed,
                   default_filters jsonb, z_index, version int, updated_by, updated_at

canvas_components  id uuid PK, canvas_id → canvases, group_id → canvas_groups NULL,
                   type, title, x, y, w, h, z_index,
                   config jsonb, config_version int,
                   view_restricted bool, edit_restricted bool,
                   version int, created_by, updated_by, created_at, updated_at
component_acl      component_id → canvas_components, knox_id → users,
                   access (view|edit)              PK (component_id, knox_id)

query_log          id bigserial, ts, knox_id, canvas_id, component_id, dataset_id,
                   shape_kind, params_hash, cache_hit bool, duration_ms,
                   upstream_ms, rows_upstream, rows_returned, bytes_returned,
                   status (ok|error|timeout), error_code, error_message
audit_log          id bigserial, ts, actor, action, target_type, target_id, details jsonb
```

Notes:

- `version` on each canvas, group and component is used for optimistic locking. `canvases.revision` goes up by one per applied ops batch, which makes change polling possible later.
- Components are rows, not entries in one JSON document, so permissions, conflicts and audits work per component. See DD-011.
- Soft delete on canvases (`deleted_at`) so admins can restore mistakes. Components and groups are hard-deleted, with the audit log as the record.
- `query_log` is partitioned or pruned by time. Default retention is 90 days.

## Deployment

- On-prem. The frontend is built to static files and served behind the same gateway that sets `x-knox-id`. FastAPI runs in containers behind it, on a path such as `/api`.
- **Network rule:** FastAPI must only be reachable through the gateway, otherwise anyone could forge `x-knox-id`. Optionally, FastAPI also checks a trusted-proxy CIDR list.
- PostgreSQL for app state.
- Configuration through environment variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection |
| `DATA_API_BASE_URL`, `DATA_API_TOKEN` | Internal data API location and credentials |
| `IDENTITY_HEADER` | Default `x-knox-id` |
| `TRUSTED_PROXY_CIDRS` | Optional source-address check for the identity header |
| `BOOTSTRAP_ADMINS` | Comma-separated Knox IDs that are always admins (seed and lockout protection) |
| `DEV_KNOX_ID` | Local development only: identity to use when the header is absent |
| `CACHE_MAX_BYTES`, `CACHE_DEFAULT_TTL` | Query cache limits |
| `QUERY_LOG_RETENTION_DAYS` | Default 90 |

## Cross-cutting concerns

- **Security:** see [permissions.md](permissions.md). Also: no secrets in the frontend, sanitized Markdown, parameters validated against dataset schemas, row and size limits on every query.
- **Observability:** a request ID on every request (returned in a header and shown in error toasts), structured JSON logs with Knox ID, and the query log feeding the admin usage pages.
- **Errors:** typed error codes from the API (see [api.md](api.md#errors)). Components show inline error states with a retry, never a blank box.
- **Testing:**
  - Frontend: Vitest for registry, filter resolution, ops and inverse ops, and the sync queue. Playwright for canvas flows against docker-compose with the mock data API.
  - Backend: pytest for permission rules (table-driven), ops application and conflicts, shaping functions, and the dataset loader. Contract tests against the mock data API.
- **Accessibility:** keyboard reachable palette, inspector and dialogs. Components expose titles and data tables as an alternative to visuals where feasible.
