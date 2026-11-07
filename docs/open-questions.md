# Open questions

Questions that affect the design but aren't answered yet. Each lists the **assumption** in use until it's resolved. Resolved questions move to the bottom with their answers.

## Identity and users

1. **Display names:** is there a directory or API to resolve a Knox ID to a name, email or department?
   *Assumption:* no. The UI shows Knox IDs, and the share dialog searches only users who've used the app before.
2. **Group membership:** can we get the teams or AD groups a Knox ID belongs to (header or lookup)? It would enable sharing with a whole team.
   *Assumption:* no. Shares and ACLs are per user.
3. **Gateway guarantees:** does the gateway always strip any client-supplied `x-knox-id` before setting its own, and is FastAPI unreachable except through it?
   *Assumption:* yes to both. `TRUSTED_PROXY_CIDRS` is available as an extra check.

## Internal data API

> **Demo:** questions 4–8 don't block this build. The [mock data API](mock-data-api.md) defines the endpoints, envelope, limits and latency we develop against. They still need answers before connecting to the real API.

4. **Endpoint catalog:** which endpoints exist today, and which ones does v1 need (SPC points, lot history, wafer die data, tool and chamber lists, lot search)?
   *Assumption:* the first data milestone uses 3–5 endpoints, mirrored by the mock data API.
5. **Response format:** JSON only, or can it return Arrow or Parquet? What is the envelope (where are the rows, how are errors reported)?
   *Assumption:* JSON with rows under a configurable `records_path`.
6. **Server-side reduction:** can its endpoints paginate, limit rows, or aggregate (e.g. per-die means, time bucketing)? If so, FastAPI should push that work down rather than pulling millions of rows.
   *Assumption:* no. FastAPI fetches full results and shapes them, guarded by `max_rows`.
7. **Auth to the data API:** service token, or must calls carry the end user's identity (`x-knox-id` forwarded)?
   *Assumption:* service token, with optional header forwarding available in the client.
8. **Latency and limits:** typical and worst-case response times, rate limits, maximum payload sizes?
   *Assumption:* most calls take under 10 s and none over 60 s. Async job handling isn't needed in v1.

## Permissions

9. **Who manages component restrictions?** Only the canvas owner and admins, or also the component's creator?
   *Assumption:* owner and admins.
10. **Should hidden components leave a trace?** For example, "2 components hidden" for users who can't see them.
    *Assumption:* no trace.
11. **Group-level restrictions:** restrict a whole group at once instead of each component?
    *Assumption:* not in v1. Owners can multi-select components and restrict them together.
12. **Does any data need dataset-level restrictions**, so that some users must not query a dataset at all?
    *Assumption:* no (DD-012).

## Domain details

13. **Wafer coordinates:** are x/y die indices (integers) or physical positions (mm)? What wafer size, typical die count, and notch convention?
    *Assumption:* integer die indices, up to about 50k dies, notch down. The outline is fitted to the die extent. (The mock serves non-negative integer die indices: 300 mm wafer, 6 mm dies, about 1,800 dies per wafer.)
14. **Wafer map values:** one numeric value per die, or several measurement sites per die (needing per-die aggregation)?
    *Assumption:* possibly several. The `wafer` shape aggregates per die.
15. **Filter vocabulary:** confirm the dimensions (lot, wafer, tool, chamber, recipe, step or operation, product, parameter, time range) and that IDs are formatted the same across data API endpoints.
16. **SPC:** are control limits always provided by the data API, or does the app sometimes compute them? Which run rules matter beyond "beyond limits"?
    *Assumption:* limits come from the data. v1 flags beyond-limit points only.

## Operations

17. **Platform:** Docker hosts, Kubernetes, or VMs? Is PostgreSQL provided as a managed service?
18. **Browser targets:** current Chromium-based browsers (Edge or Chrome) only?
    *Assumption:* yes.
19. **Query log retention:** is 90 days right? Are there constraints on storing Knox IDs in logs?

## Product

20. **Export:** CSV export of component data and PNG export of components or canvases in v1?
21. **Templates:** canvas templates (e.g. "excursion investigation") to start from?
22. **History:** canvas version history and restore, beyond admin restore of deleted canvases?
23. **Auto-refresh:** do any monitoring use cases need components to refresh on an interval? The design allows it, with a minimum of 60 s.

---

## Resolved

| Question | Answer | Where it landed |
| --- | --- | --- |
| Data sources | SQL databases and internal APIs, all reached through an existing internal data API (Iceberg/Trino, external DBs, DynamoDB) that FastAPI calls | DD-004, DD-005, [data-layer.md](data-layer.md) |
| How FastAPI asks for data | Fixed endpoints, no SQL | DD-005 |
| v1 component types | Charts, wafer maps, tables, notes | [components.md](components.md) |
| Persistence | Server-side, shareable | DD-010, DD-011 |
| Deployment | On-prem, FastAPI backend built by the project owner | [architecture.md](architecture.md#deployment) |
| Linking components | Shared filters, no edges | DD-003 |
| Backend language | Python, FastAPI | DD-004 |
| Authentication | Not handled by the app. Users are pre-authenticated. Identity is in `x-knox-id` | DD-009 |
| Scale | Department (50–500 users), large data | DD-007, DD-017 |
| Security level | Basic: view and write permissions per component on a canvas | DD-010, [permissions.md](permissions.md) |
| Wafer map data | x/y coordinates with numeric values and wafer and lot identifiers | [components.md](components.md#wafer-map) |
| Who defines datasets | The admin (project owner), as code | DD-006 |
| Admin screen priority | High. Permissions and usage & health first | DD-020, [admin.md](admin.md) |
| Real data access in this build | None. This is a demo. A local mock data API serves dummy data | [mock-data-api.md](mock-data-api.md), DD-019 |
