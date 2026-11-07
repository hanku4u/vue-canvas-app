# Admin screen

A priority feature. Reachable at `/admin`, visible only to admins (`GET /api/me` → `isAdmin`). All endpoints are under `/api/admin/*` and require admin. Two areas ship first: **Permissions** and **Usage & health**. Dataset and filter definitions stay as code in v1.

```
┌────────────────────────────────────────────────────────────────────┐
│ Admin                                                   j.doe ▾    │
├──────────────┬─────────────────────────────────────────────────────┤
│ Permissions  │                                                     │
│   Admins     │                 (selected page)                     │
│   Canvases   │                                                     │
│   User access│                                                     │
│ Usage        │                                                     │
│   Overview   │                                                     │
│   Datasets   │                                                     │
│   Slow / err │                                                     │
│ Health       │                                                     │
│ Audit log    │                                                     │
└──────────────┴─────────────────────────────────────────────────────┘
```

## Permissions

### Admins

- Table of admins: Knox ID, display name, granted by, granted at, plus bootstrap admins marked "from config" (not removable here).
- Add an admin by Knox ID. Remove one (you can't remove yourself if you're the last non-bootstrap admin).
- Audited.

### Canvases

Browse every canvas in the app, including soft-deleted ones.

```
Search [            ]  Owner [ any ▾ ]  [ ] Show deleted

Title                 Owner     Shares  Restricted comps  Updated      ⋯
ET-04 CD excursion    j.doe     3       1                 2h ago       ⋯
Litho weekly          k.lee     12      0                 1d ago       ⋯
Old test (deleted)    m.park    0       0                 30d ago      ⋯
```

Row actions:

- **Open:** opens the canvas in the editor with admin rights, with a banner saying "Viewing as admin".
- **Manage access:** the share dialog (add or remove users, change roles) plus a list of restricted components and their ACLs, editable.
- **Transfer ownership:** pick a new owner by Knox ID. The previous owner becomes an editor unless removed.
- **Delete or restore:** soft delete and restore.

### User access lookup

"What can this person access?" Enter a Knox ID and see:

- Canvases they own.
- Canvases shared with them, with role.
- Components where they appear on an ACL, and components hidden from them on canvases they can open.
- Bulk actions: remove all shares (e.g. someone left the team), transfer all owned canvases to someone else.

## Usage & health

All usage numbers come from `query_log`, aggregated in SQL (`percentile_cont` for p50 and p95). There is a time-range selector at the top of each page (24 h, 7 d, 30 d). Charts use the same ECharts setup as the canvas.

### Overview

- Tiles: active users (distinct Knox IDs with any request), queries, cache hit rate, error rate, p95 query time, canvases created.
- Charts: queries per hour and errors per hour, active users per day.
- Top canvases by query volume. Component type mix across all canvases.

### Datasets

| Dataset | Calls | Users | Cache hit | p50 | p95 | Errors | Avg upstream rows | Avg returned rows |
| --- | --: | --: | --: | --: | --: | --: | --: | --: |
| spc_points | 4,210 | 38 | 71% | 0.4 s | 6.2 s | 0.8% | 410k | 2.1k |

Clicking a dataset opens a detail page with a latency over time chart, error breakdown by code, its slowest calls, and the canvases that use it.

### Slow queries and errors

- **Slow queries:** calls above a threshold (default 10 s) with time, user, canvas and component (linked), dataset, duration split (upstream vs shaping), and rows.
- **Errors:** recent failures with error code, message, request ID, user and dataset. Filterable by code.

### Health

Live status, refreshed every 30 s:

| Check | Source |
| --- | --- |
| Data API | Background health check every 60 s: status, latency, last success, last failure message. History chart for the last 24 h |
| PostgreSQL | Connectivity and pool usage |
| Query cache | Entries, bytes used of max, hit rate, evictions |
| Upstream concurrency | In-flight upstream calls vs cap, queued requests |
| App | Version or commit, uptime, loaded datasets count, dataset load errors (should be zero) |

### Audit log

A filterable list of `audit_log` entries (actor, action, target, time, details). See [permissions.md](permissions.md#audit).

## Later

- **Datasets (read-only):** list of loaded datasets with params, columns, filter hints and source file, plus a **test runner** that executes a dataset with given params and shows timing, row counts and the first 100 rows.
- **Filter dimensions (read-only):** list from `filters.yaml` with which datasets bind to each.
- **Editable datasets and filters in the UI:** only if defining them as code becomes a bottleneck.
- **Alerts:** notify admins when the data API is down or a dataset's error rate spikes.
