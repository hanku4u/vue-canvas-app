# Data layer

How data gets from the internal data API to a component on the canvas.

```
Component ──(dataset, effective params, shape)──▶ FastAPI /api/query
   ▲                                                   │
   │                                     validate params against dataset
   │                                     shaped-result cache? ──hit──┐
   │                                     raw-result cache?  ──hit──┐ │
   │                                     coalesce identical calls  │ │
   │                                     data API GET /endpoint    │ │
   │                                     → Polars DataFrame ◀──────┘ │
   │                                     shape (LTTB, bins, page…)   │
   └──────────── JSON or Arrow IPC ◀──── serialize ◀─────────────────┘
                                         write query_log row
```

## The internal data API

An existing service that fronts Iceberg tables (through Trino), external databases and DynamoDB. For this app it is a black box with **fixed endpoints**. FastAPI never sends SQL.

> **Demo:** the real data API isn't available. FastAPI points `DATA_API_BASE_URL` at the local [mock data API](mock-data-api.md), whose envelope (`data.items`), list-parameter style and error codes are the ones assumed throughout this document.

FastAPI's client (`backend/app/dataapi/`):

| Concern | Behavior |
| --- | --- |
| Transport | One shared `httpx.AsyncClient`, HTTP keep-alive, base URL from `DATA_API_BASE_URL` |
| Auth | Service credential from `DATA_API_TOKEN`. Optionally forwards `x-knox-id` downstream (see open questions) |
| Timeouts | Connect 5 s. Read: per dataset (default 60 s) |
| Retries | Up to 2 on connection errors and 502, 503 or 504, with jittered backoff. No retry on 4xx |
| Concurrency | Global semaphore (e.g. 16 in-flight calls) so a canvas full of components can't flood the data API |
| Coalescing | Identical requests (same endpoint and params) in flight at the same time share one upstream call |
| Health | Background check every 60 s against a cheap endpoint. Results feed the admin health page |
| Errors | Mapped to app error codes: `UPSTREAM_TIMEOUT`, `UPSTREAM_ERROR`, `UPSTREAM_BAD_RESPONSE` |

## Datasets

A dataset is a named, typed description of one data API endpoint. The admin defines datasets **as code**: YAML files in `backend/config/datasets/`, validated by Pydantic at startup. The app refuses to start on an invalid dataset, so mistakes surface in CI.

### Example

```yaml
# backend/config/datasets/spc_points.yaml
id: spc_points
label: SPC points
description: SPC measurements per tool and parameter, with control and spec limits.
category: SPC                       # groups datasets in the picker

request:
  method: GET
  path: /spc/points                 # fixed data API endpoint
  timeout_sec: 60

params:
  tool:
    type: string[]
    required: true
    filter: tool_id                 # auto-bind suggestion
    api_name: tool_ids              # name sent to the data API (defaults to the param name)
  parameter:
    type: string
    required: true
    values_from: { dataset: spc_parameters, column: parameter }   # picker source
  start:
    type: datetime
    required: true
    filter: time_range.start
  end:
    type: datetime
    required: true
    filter: time_range.end
  lot:
    type: string[]
    filter: lot_id
    api_name: lot_ids
  level:
    type: enum
    values: [site, wafer]
    default: wafer

response:
  records_path: data.items          # where the row array lives in the JSON response
  columns:
    ts:        { type: datetime }
    value:     { type: float, label: Value }
    target:    { type: float }
    ucl:       { type: float }
    lcl:       { type: float }
    usl:       { type: float }
    lsl:       { type: float }
    tool_id:   { type: string, label: Tool }
    chamber:   { type: string }
    lot_id:    { type: string, label: Lot }
    wafer_id:  { type: string, label: Wafer }
    site:      { type: int }
  tooltip: [lot_id, wafer_id, tool_id, chamber]

limits:
  max_rows: 5_000_000               # upstream rows accepted before refusing
  max_range_days: 90                # guard on time range params

cache:
  ttl_sec: 300

suits: [chart, table]               # component types offered this dataset
```

### Parameter types

`string`, `string[]`, `int`, `float`, `bool`, `date`, `datetime`, `enum` (with `values`). Each can be `required`, carry a `default`, a `filter` hint, an `api_name`, and a `values_from` source for pickers.

### Response handling

- JSON rows from the data API are converted to a Polars DataFrame with the declared column types. Unknown columns are dropped and missing declared columns are filled with nulls (and logged).
- If the data API later offers Arrow or Parquet responses, the loader accepts them directly. That is faster for big results.
- An optional Python hook (`transform: module:function`) handles datasets that need a post-fetch transform such as reshaping or derived columns.

### Admin workflow for a new dataset

1. Add a YAML file under `backend/config/datasets/`.
2. Run `python -m app.datasets check` locally. It validates the file and runs it against the mock or real data API with sample params.
3. Commit and deploy. The dataset appears in the component dataset picker.

A read-only dataset list with a test runner is planned for the admin screen after v1 (see [admin.md](admin.md#later)).

## Filters

### Filter dimensions

The shared filter vocabulary is defined once in `backend/config/filters.yaml`:

```yaml
- id: time_range
  label: Time range
  type: time_range
  default: { relative: last_7d }

- id: tool_id
  label: Tool
  type: string_list
  values_from: { dataset: tool_list, column: tool_id }

- id: lot_id
  label: Lot
  type: string_list
  values_from: { dataset: lot_search, column: lot_id, search_param: prefix }

- id: wafer_id
  label: Wafer
  type: string_list

- id: chamber
  label: Chamber
  type: string_list
  values_from: { dataset: chamber_list, column: chamber }
```

Types: `string_list`, `number_range`, `time_range`. `values_from` powers the searchable picker through `/api/filters/{id}/values`.

### Scopes and resolution

For each component and each dimension it binds, the effective value is the first non-empty value in this order:

1. Component override (`config.overrides`)
2. Group session value (set in the UI or published by a component in the group)
3. Group saved default
4. Canvas session value
5. Canvas saved default
6. Dimension default (from `filters.yaml`)

Session values live in the client only (canvas-level ones are mirrored in the URL). Saved defaults are stored on the canvas or group and change only when an editor clicks "Save as default".

**Relative time ranges** (`last_7d`) are stored as relative and resolved to absolute timestamps on the client at query time, rounded down to the minute so cache keys stay stable.

### From filters to params

```
effective filters ─▶ for each binding (param → dimension):
                        time_range dims split into .start / .end
                        string_list dims passed as arrays
                     ─▶ merged over config.params
                     ─▶ /api/query params
```

The backend re-validates every param against the dataset definition. It never trusts the client's typing.

## Shapes

The component says how it wants the result, and the backend shapes it so payloads stay small regardless of upstream size.

| Shape | Used by | Backend does | Output size |
| --- | --- | --- | --- |
| `raw` | small datasets, debugging | column selection, row limit (≤ 10k) | ≤ limit |
| `timeseries` | line, SPC | sort by x, LTTB per series to `target_points` | ≈ target × series |
| `scatter` | scatter | uniform sample to `max_points` (or 2D binning if requested) | ≤ max_points |
| `histogram` | histogram | bin edges and counts per group | bins × groups |
| `boxplot` | boxplot | quartiles, whiskers, outlier sample per category | categories × 6 (+ outliers) |
| `table` | table | filter, sort, slice `offset:limit` | ≤ limit |
| `wafer` | wafer map | group by (wafer, x, y), aggregate value | dies × wafers |
| `distinct` | filter pickers | unique values, optional prefix search, limit | ≤ limit |

Full request and response formats are in [api.md](api.md#post-apiquery).

## Caching

Two in-process caches:

| Cache | Key | Value | Why |
| --- | --- | --- | --- |
| Raw | `dataset + normalized params` | Polars DataFrame | Many components and shapes reuse the same upstream result (a table paging, a chart zooming, several charts on one dataset) |
| Shaped | `raw key + shape` | Serialized bytes | Repeat renders and identical components across users |

- LRU, capped by memory (`CACHE_MAX_BYTES`, e.g. 2 GB), with per-dataset TTL. Large frames count by estimated size.
- The **refresh** action sends `cache: "refresh"`, which bypasses and repopulates the cache for that key.
- Responses include `asOf` (when the upstream data was fetched), so components can show data age.
- **Scaling path:** in-process caching assumes a single backend process (uvicorn with async I/O). When multiple workers or replicas are needed, move the shaped cache to Redis and keep raw frames per process, or move raw frames to Redis as Arrow bytes.

## Wire formats

- **JSON (default):** columnar, `{"columns": [...], "data": {"ts": [...], "value": [...]}, "meta": {...}}`. Smaller than row objects and maps directly to ECharts datasets.
- **Arrow IPC:** when the client sends `Accept: application/vnd.apache.arrow.stream` and the result exceeds about 50k cells, the backend returns an Arrow stream with metadata in the `X-Query-Meta` response header. Wafer galleries and large scatter plots are the main users.
- Response compression (gzip or br) is handled by the gateway or by FastAPI middleware.

## Query logging

Every `/api/query` call writes one `query_log` row (see [architecture.md](architecture.md#data-model-postgresql)): who, which canvas and component, which dataset, cache hit, total and upstream time, upstream and returned row counts, and status. Writes are batched asynchronously so logging never slows queries down. The admin usage and health pages read from this table.

## Limits and safeguards

- Per-dataset `max_rows` and time-range guards, enforced before calling upstream where possible and on the response otherwise.
- Per-request timeout, with a clear `UPSTREAM_TIMEOUT` error suggesting the user narrow the filters.
- A global concurrency cap on upstream calls, and a per-user cap on concurrent `/api/query` requests (e.g. 8) to stop one canvas from starving others.
- Query parameters are logged as a hash plus the dataset's declared "safe to log" params only.
