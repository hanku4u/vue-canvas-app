# Documentation

Planning and design docs for **vue-canvas-app**, an infinite-canvas workspace for semiconductor manufacturing engineers. Users place data components (charts, wafer maps, tables, notes) on a canvas, arrange and group them freely, link them through shared filters, and save canvases to share with colleagues. Each component can have its own view and edit restrictions.

## Reading order

| Doc | What it covers |
| --- | --- |
| [scope.md](scope.md) | Problem, users, goals, v1 in/out, roadmap, ownership |
| [architecture.md](architecture.md) | System overview, frontend and backend structure, key request flows, data model, deployment |
| [canvas-ux.md](canvas-ux.md) | Screens, canvas interactions, shortcuts, the filter bar, read-only and locked states |
| [components.md](components.md) | Spec for each component type (chart, wafer map, table, note) and their shared behavior |
| [data-layer.md](data-layer.md) | Datasets, the internal data API, filters, query shaping, caching, wire formats |
| [permissions.md](permissions.md) | Identity, roles, canvas sharing, per-component restrictions, enforcement |
| [admin.md](admin.md) | Admin screen: permissions management, usage and health |
| [api.md](api.md) | Frontend ↔ FastAPI contract: endpoints, payloads, errors |
| [mock-data-api.md](mock-data-api.md) | The local dummy data API used in place of the real one: fake fab model, planted excursion, endpoints |
| [design-decisions.md](design-decisions.md) | Decision log with alternatives and reasoning |
| [open-questions.md](open-questions.md) | Unresolved questions and the assumptions in use until they're answered |

## Glossary

| Term | Meaning |
| --- | --- |
| **Canvas** | A saved, shareable workspace: an infinite surface holding components and groups. |
| **Component** | One item placed on a canvas (a specific chart, wafer map, table or note) with its position, size and configuration. Called a *node* inside the canvas library. |
| **Component type** | The kind of component: `chart`, `wafer-map`, `table`, `note`. Each type is registered in the frontend component registry. |
| **Group** | A titled frame containing components. It moves as a unit and can carry its own filters. |
| **Dataset** | An admin-defined, named data query that maps to a fixed endpoint of the internal data API, with typed parameters and known columns. |
| **Data API** | The existing internal service that reads from Iceberg, external databases, Trino and DynamoDB. Only FastAPI talks to it. |
| **Filter dimension** | A shared filter key such as `lot_id`, `wafer_id`, `tool_id` or `time_range`, defined once and used across datasets. |
| **Filter scope** | Where a filter value applies: the whole canvas, one group, or one component. |
| **Binding** | A component's mapping from a filter dimension to one of its dataset's parameters. |
| **Publishing** | A component pushing a selection (e.g. selected lots in a table) into its filter scope. |
| **Shape** | The form a component asks the backend to return data in: downsampled time series, histogram bins, a table page, per-die wafer values, and so on. |
| **Restriction** | A per-component rule that narrows who can view or edit that component. |
| **Knox ID** | The user identifier from the `x-knox-id` header, set by the upstream auth layer. |

## Status

**Demonstration application.** There is no access to the real internal data API. All data comes from the local [mock data API](mock-data-api.md) (`mock-data-api/`, built and tested). The canvas frontend and the FastAPI backend are not started yet. Decisions marked **Proposed** in [design-decisions.md](design-decisions.md) are still open to change.
