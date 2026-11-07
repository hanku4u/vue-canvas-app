# Mock data API

This is a demonstration application with no access to the real internal data API. `mock-data-api/` stands in for it: a small FastAPI service, served locally, that returns deterministic dummy data for a fake fab. In the demo, the app's FastAPI backend calls it exactly as it would call the real data API (see [data-layer.md](data-layer.md)).

Running it, configuring it and testing it are covered in [mock-data-api/README.md](../mock-data-api/README.md). Default address: `http://127.0.0.1:8001`. Interactive OpenAPI docs are at `/docs`.

## Design goals

- **Looks like a real upstream service:** fixed endpoints, a JSON envelope, error codes, row limits, latency and occasional failures.
- **Consistent data:** every endpoint is generated from one fab model, so a lot in the lot table has SPC points on the tools its history says, and wafer maps reflect what happened at etch. Cross-filtering between components finds real relationships.
- **Deterministic:** values come from hashing keys (lot, wafer, site, die), not from a stateful random generator. The same query always returns the same rows, and a filtered query is an exact subset of the unfiltered one. With `MOCK_NOW` set, everything is fully reproducible.
- **Enough volume to matter:** a lot every 30 minutes since 2026-01-01 (about 15k lots), 9 sites per wafer for most parameters, and about 1,800 dies per wafer. Unfiltered queries quickly reach hundreds of thousands of rows, which exercises downsampling, paging and the large-result guards.

## The fake fab

**Products:** `PRD-A100` (50% of lots), `PRD-B200` (30%), `PRD-C300` (20%). Lot IDs are the product letter plus a 6-digit sequence (`A014373`). Wafer IDs are `<lot>.<slot>` (`A014373.02`). Every lot has 25 wafers.

**Route:** every lot runs the same six steps. Each step's tool is picked per lot, and each step's chamber is picked per wafer.

| Step | Area | Tools | Chambers | Parameters (level) | Reached after release |
| --- | --- | --- | --- | --- | --- |
| `1000-GATE-OX` | DIFF | DF-01..02 | A, B | `THK_OX` Å (9 sites) | ~4 h |
| `2000-POLY-DEP` | CVD | CV-01..03 | A–C | `THK_POLY` Å (9 sites) | ~14 h |
| `3000-GATE-LITHO` | LITHO | LI-01..03 | A | `CD_LITHO` nm, `OVL_X` nm (5 sites) | ~26 h |
| `4000-GATE-ETCH` | ETCH | ET-01..04 | A–D | `CD_MEAN` nm (9 sites), `ETCH_DEPTH` nm (5 sites) | ~36 h |
| `5000-CMP` | CMP | CM-01..02 | A, B | `THK_CMP` Å (9 sites) | ~50 h |
| `9000-WAFER-SORT` | TEST | TS-01..03 | A | `VTH` mV, `IDSAT` µA/µm (per die) | ~140 h |

So the newest lots are still in progress (QUEUED, ACTIVE, a few on HOLD) and only lots older than about 6 days have wafer-sort data.

**Metrology values:** target, plus a tool offset, a chamber offset, a slow drift (18-day cycle), lot and wafer effects, a fixed site profile and noise. On about 6% of days a tool has a random excursion on one chamber for a few hours (2.5–4σ). That gives realistic, occasional out-of-control points everywhere.

**Control limits:** ±3σ around target (tighter for `level=wafer`), tightened by 10% on 2026-09-01, so long-range SPC charts show a limit step. Spec limits are ±6σ.

**Wafer sort (die level):** each die's value combines:
- a wafer level driven by that wafer's etch CD (wider CD → higher `VTH`, lower `IDSAT`)
- a center-to-edge bowl, a random tilt, and an edge roll-off
- an occasional hot spot (about 12% of wafers)
- noise

Die coordinates `x`, `y` are non-negative integer die indices on a 300 mm wafer with 6 mm dies and 3 mm edge exclusion. The grid is about 47 × 47 with about 1,800 dies.

## The planted excursion (demo story)

`GET /featured` describes it. Etch tool **ET-03, chamber C** runs `CD_MEAN` about **3σ high** from **10 days ago until 4 days ago** (UTC day boundaries, relative to "now", so it's always inside a 30-day view). Downstream effects:

1. **SPC:** most `CD_MEAN` points from ET-03 / C in that window are above the UCL.
2. **Wafer maps:** affected wafers have a strong edge ring and a shifted mean in `VTH` and `IDSAT`.
3. **Lots:** lots with wafers through ET-03 / C in that window have lower `yield_pct` (about 7 points).

A demo walk-through:
- An SPC chart of `CD_MEAN` shows the out-of-control points.
- Brushing the time range or clicking points publishes `lot_id`.
- A lot table filtered by `tool_id = ET-03` shows the low-yield lots.
- Selecting a lot shows its wafer maps with the ring on the chamber-C wafers.

## Conventions

- **Base URL:** `http://127.0.0.1:8001`. No auth (any `Authorization` header is ignored).
- **List parameters:** comma-separated and/or repeated: `?tool_ids=ET-01,ET-03` or `?tool_ids=ET-01&tool_ids=ET-03`.
- **Times:** ISO 8601. Naive times are treated as UTC. Response times are UTC with a `Z` suffix.
- **Default time window:** the last 7 days. Maximum 120 days.

Success envelope (matches `records_path: data.items` in dataset YAML):

```json
{
  "data": { "items": [ { "...": "..." } ] },
  "meta": { "count": 17523, "generated_at": "2026-11-07T12:00:00Z", "request_id": "…", "start": "…", "end": "…" }
}
```

Error envelope:

```json
{ "error": { "code": "RESULT_TOO_LARGE", "message": "Query would return 1,057,977 rows (limit 500,000)…", "request_id": "…" } }
```

| HTTP | Code | When |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | Malformed parameter (wrong type, out of range) |
| 400 | `INVALID_PARAMETER` | Unknown parameter, tool not valid for the step, missing required list |
| 400 | `RANGE_TOO_LARGE` | Time range over 120 days |
| 413 | `RESULT_TOO_LARGE` | SPC result over `MOCK_MAX_ROWS` (default 500k) |
| 413 | `TOO_MANY_WAFERS` / `TOO_MANY_LOTS` | Over the per-request limits |
| 503 (or forced) | `UPSTREAM_UNAVAILABLE` | Simulated failure (`MOCK_ERROR_RATE` or the `x-mock-fail` header) |

## Endpoints

### Reference data

| Endpoint | Params | Row fields |
| --- | --- | --- |
| `GET /health` | — | `status, now, data_since, lots_released` |
| `GET /products` | — | `product, description` |
| `GET /steps` | — | `step, step_id, name, area, sequence` |
| `GET /tools` | `area?` | `tool_id, area, step, chambers[]` |
| `GET /parameters` | `area?`, `level?` (`site`\|`die`) | `parameter, description, unit, step, area, level, target, sites` |
| `GET /featured` | — | The planted excursion: `tool_id, chamber, parameter, shift_sigma, start, end, effects[]` |

### `GET /spc/points`

SPC metrology for one site-level parameter.

| Param | Required | Notes |
| --- | --- | --- |
| `parameter` | yes | `THK_OX`, `THK_POLY`, `CD_LITHO`, `OVL_X`, `CD_MEAN`, `ETCH_DEPTH`, `THK_CMP` |
| `tool_ids` | no | Tools of that parameter's step. Default: all |
| `lot_ids` | no | Restrict to these lots |
| `start`, `end` | no | Default: the last 7 days |
| `level` | no | `site` (default, one row per site) or `wafer` (site mean, one row per wafer) |

Rows, sorted by `ts`: `ts, parameter, unit, step, tool_id, chamber, product, lot_id, wafer_id, slot, site, value, target, ucl, lcl, usl, lsl`.

Volume: `CD_MEAN` for one etch tool over 7 days is about 17k site rows. All four tools over 30 days is about 300k.

### `GET /lots`

Lots released in a window, newest first.

| Param | Notes |
| --- | --- |
| `start`, `end` | Release window. Default: the last 7 days |
| `products` | e.g. `PRD-A100` |
| `tool_ids` | Lots that have run on any of these tools (at any started step) |
| `status` | `QUEUED`, `ACTIVE`, `HOLD`, `COMPLETE` |
| `prefix` | Lot ID prefix search, e.g. `A0143` |
| `limit` | 1–10,000. Default 1,000 |

Rows: `lot_id, product, release_ts, status, current_step, current_tool, wafer_count, priority, yield_pct` (completed lots only), plus `diff_tool, cvd_tool, litho_tool, etch_tool, cmp_tool, test_tool` (null until that step starts).

### `GET /lots/history`

`lot_ids` (required, ≤ 500). One row per lot per step: `lot_id, product, step, area, tool_id, chambers, track_in, track_out, status (DONE|RUNNING|PENDING), wafer_count`.

### `GET /wafers`

`lot_ids` (required, ≤ 200). One row per wafer: `lot_id, wafer_id, slot, etch_tool, etch_chamber, etch_ts, tested, test_ts`. Useful for wafer pickers and for finding chamber-C wafers.

### `GET /wafers/dies`

Die-level wafer-sort results for tested wafers. Untested wafers return no rows.

| Param | Notes |
| --- | --- |
| `parameter` | `VTH` (default) or `IDSAT` |
| `lot_ids` | All 25 wafers of each lot |
| `wafer_ids` | Specific wafers. Combined with `lot_ids`. At least one of the two is required. 100-wafer limit |

Rows: `lot_id, wafer_id, slot, x, y, parameter, unit, value, test_tool, test_ts`. `meta` adds `die_size_mm, x_range, y_range, dies_per_wafer`.

## Datasets for the demo

The first datasets in `backend/config/datasets/` map onto these endpoints:

| Dataset | Endpoint | Used by |
| --- | --- | --- |
| `spc_points` | `/spc/points` | SPC, trend, histogram and box plot charts |
| `lots` | `/lots` | Lot table (publishes `lot_id`) |
| `lot_history` | `/lots/history` | Route history table |
| `wafers` | `/wafers` | Wafer picker, `wafer_id` filter values |
| `wafer_dies` | `/wafers/dies` | Wafer map |
| `tool_list`, `parameter_list`, `product_list` | `/tools`, `/parameters`, `/products` | Filter value pickers |
