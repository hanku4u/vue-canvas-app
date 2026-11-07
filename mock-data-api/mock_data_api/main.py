"""FastAPI app: a local stand-in for the internal fab data API.

Response envelope (success):  {"data": {"items": [...]}, "meta": {...}}
Response envelope (error):    {"error": {"code": "...", "message": "..."}}

List parameters accept comma-separated values and/or repeated keys:
    ?tool_ids=ET-01,ET-03   or   ?tool_ids=ET-01&tool_ids=ET-03
"""

from __future__ import annotations

import asyncio
import os
import random
import uuid
from datetime import datetime, timezone
from typing import Annotated, Literal

import orjson
from fastapi import FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import Response

from . import fab, generators
from .generators import DataError

MAX_RANGE_DAYS = 120
MAX_ROWS = int(os.environ.get("MOCK_MAX_ROWS", 500_000))
MAX_WAFERS = int(os.environ.get("MOCK_MAX_WAFERS", 100))

app = FastAPI(
    title="Mock fab data API",
    version="0.1.0",
    description=(
        "Deterministic dummy data standing in for the internal data API (Iceberg/Trino/DynamoDB). "
        "See docs/mock-data-api.md in the repository for the data story and endpoint catalogue."
    ),
)

CsvList = Annotated[list[str] | None, Query(description="Comma-separated or repeated values")]


# ---------------------------------------------------------------------------
# Envelope and errors
# ---------------------------------------------------------------------------


def _json(payload: dict, status: int = 200) -> Response:
    return Response(orjson.dumps(payload), status_code=status, media_type="application/json")


def _error(status: int, code: str, message: str, request: Request) -> Response:
    return _json(
        {"error": {"code": code, "message": message, "request_id": request.state.request_id}},
        status,
    )


def _ok(request: Request, items: list[dict], **meta) -> Response:
    return _json(
        {
            "data": {"items": items},
            "meta": {
                "count": len(items),
                "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
                "request_id": request.state.request_id,
                **meta,
            },
        }
    )


@app.exception_handler(DataError)
async def _data_error(request: Request, exc: DataError) -> Response:
    return _error(exc.status, exc.code, exc.message, request)


@app.exception_handler(RequestValidationError)
async def _validation_error(request: Request, exc: RequestValidationError) -> Response:
    problems = "; ".join(f"{'.'.join(str(p) for p in e['loc'][1:])}: {e['msg']}" for e in exc.errors())
    return _error(400, "INVALID_REQUEST", problems or "Invalid request", request)


# ---------------------------------------------------------------------------
# Simulated latency and failures
#   MOCK_LATENCY_MS   base latency per request (default 150, randomised ±50%)
#   MOCK_ERROR_RATE   fraction of requests failing with 503 (default 0)
#   Per request:  x-mock-latency-ms: 3000   x-mock-fail: 503
# ---------------------------------------------------------------------------

_UNSIMULATED = ("/docs", "/redoc", "/openapi.json")


@app.middleware("http")
async def _simulate(request: Request, call_next):
    request.state.request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
    if not request.url.path.startswith(_UNSIMULATED):
        try:
            latency = float(request.headers.get("x-mock-latency-ms", os.environ.get("MOCK_LATENCY_MS", 150)))
        except ValueError:
            latency = 150.0
        if latency > 0:
            await asyncio.sleep(latency * random.uniform(0.5, 1.5) / 1000)

        forced = request.headers.get("x-mock-fail")
        error_rate = float(os.environ.get("MOCK_ERROR_RATE", 0) or 0)
        if forced or (error_rate and random.random() < error_rate):
            status = int(forced) if forced and forced.isdigit() else 503
            return _error(status, "UPSTREAM_UNAVAILABLE", "Simulated failure", request)

    response = await call_next(request)
    response.headers["x-request-id"] = request.state.request_id
    return response


# ---------------------------------------------------------------------------
# Parameter helpers
# ---------------------------------------------------------------------------


def _csv(values: list[str] | None) -> list[str]:
    out: list[str] = []
    for value in values or []:
        out.extend(part.strip() for part in value.split(",") if part.strip())
    return out


def _epoch(dt: datetime) -> int:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp())


def _range(start: datetime | None, end: datetime | None, now: int, default_days: int = 7) -> tuple[int, int]:
    end_s = _epoch(end) if end else now
    start_s = _epoch(start) if start else end_s - default_days * fab.DAY_S
    if start_s > end_s:
        raise DataError(400, "INVALID_PARAMETER", "start must be before end")
    if end_s - start_s > MAX_RANGE_DAYS * fab.DAY_S:
        raise DataError(400, "RANGE_TOO_LARGE", f"Time range is limited to {MAX_RANGE_DAYS} days")
    return start_s, end_s


def _iso(ts: int) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


# ---------------------------------------------------------------------------
# Reference data
# ---------------------------------------------------------------------------


@app.get("/health", tags=["meta"])
async def health(request: Request) -> Response:
    now = fab.now_s()
    return _ok(
        request,
        [{"status": "ok", "now": _iso(now), "data_since": _iso(fab.ANCHOR_S), "lots_released": fab.max_lot_index(now) + 1}],
    )


@app.get("/products", tags=["reference"])
async def products(request: Request) -> Response:
    return _ok(request, [{"product": p.product, "description": p.description} for p in fab.PRODUCTS])


@app.get("/steps", tags=["reference"])
async def steps(request: Request) -> Response:
    return _ok(
        request,
        [
            {"step": s.label, "step_id": s.step_id, "name": s.name, "area": s.area, "sequence": i + 1}
            for i, s in enumerate(fab.STEPS)
        ],
    )


@app.get("/tools", tags=["reference"])
async def tools(request: Request, area: str | None = None) -> Response:
    items = [
        {
            "tool_id": t.tool_id,
            "area": t.area,
            "step": fab.STEP_BY_AREA[t.area].label,
            "chambers": list(t.chambers),
        }
        for t in fab.TOOLS
        if area is None or t.area == area.upper()
    ]
    return _ok(request, items)


@app.get("/parameters", tags=["reference"])
async def parameters(
    request: Request,
    area: str | None = None,
    level: Literal["site", "die"] | None = None,
) -> Response:
    items = []
    for p in fab.PARAMETERS.values():
        step = fab.STEP_BY_ID[p.step_id]
        if (area and step.area != area.upper()) or (level and p.level != level):
            continue
        items.append(
            {
                "parameter": p.name,
                "description": p.description,
                "unit": p.unit,
                "step": step.label,
                "area": step.area,
                "level": p.level,
                "target": p.target,
                "sites": p.sites or None,
            }
        )
    return _ok(request, items)


# ---------------------------------------------------------------------------
# Measurements
# ---------------------------------------------------------------------------


@app.get("/spc/points", tags=["spc"])
async def spc_points(
    request: Request,
    parameter: str,
    tool_ids: CsvList = None,
    lot_ids: CsvList = None,
    start: datetime | None = None,
    end: datetime | None = None,
    level: Literal["site", "wafer"] = "site",
) -> Response:
    """SPC metrology points for one parameter. Defaults to the last 7 days and all tools of the step."""
    now = fab.now_s()
    start_s, end_s = _range(start, end, now)
    items = await asyncio.to_thread(
        generators.spc_points,
        parameter,
        _csv(tool_ids),
        start_s,
        end_s,
        _csv(lot_ids),
        level,
        MAX_ROWS,
        now,
    )
    return _ok(request, items, start=_iso(start_s), end=_iso(end_s), level=level)


@app.get("/lots", tags=["lots"])
async def lots(
    request: Request,
    start: datetime | None = None,
    end: datetime | None = None,
    products: CsvList = None,
    tool_ids: CsvList = None,
    status: CsvList = None,
    prefix: str | None = None,
    limit: Annotated[int, Query(ge=1, le=10_000)] = 1_000,
) -> Response:
    """Lots released in [start, end] (default last 7 days), newest first."""
    now = fab.now_s()
    start_s, end_s = _range(start, end, now)
    items = await asyncio.to_thread(
        generators.lots, start_s, end_s, _csv(products), _csv(tool_ids), prefix, _csv(status), limit, now
    )
    return _ok(request, items, start=_iso(start_s), end=_iso(end_s))


@app.get("/lots/history", tags=["lots"])
async def lot_history(request: Request, lot_ids: CsvList = None) -> Response:
    """Step-by-step route history for up to 500 lots."""
    ids = _csv(lot_ids)
    if not ids:
        raise DataError(400, "INVALID_PARAMETER", "lot_ids is required")
    if len(ids) > 500:
        raise DataError(413, "TOO_MANY_LOTS", "At most 500 lots per request")
    return _ok(request, await asyncio.to_thread(generators.lot_history, ids, fab.now_s()))


@app.get("/wafers", tags=["wafers"])
async def wafers(request: Request, lot_ids: CsvList = None) -> Response:
    """Wafers of up to 200 lots, with etch tool/chamber and test status."""
    ids = _csv(lot_ids)
    if not ids:
        raise DataError(400, "INVALID_PARAMETER", "lot_ids is required")
    if len(ids) > 200:
        raise DataError(413, "TOO_MANY_LOTS", "At most 200 lots per request")
    return _ok(request, await asyncio.to_thread(generators.wafers, ids, fab.now_s()))


@app.get("/wafers/dies", tags=["wafers"])
async def wafer_dies(
    request: Request,
    parameter: str = "VTH",
    lot_ids: CsvList = None,
    wafer_ids: CsvList = None,
) -> Response:
    """Die-level wafer sort results (x/y die coordinates) for tested wafers."""
    lots_, wafers_ = _csv(lot_ids), _csv(wafer_ids)
    if not lots_ and not wafers_:
        raise DataError(400, "INVALID_PARAMETER", "lot_ids or wafer_ids is required")
    items = await asyncio.to_thread(generators.wafer_dies, parameter, lots_, wafers_, MAX_WAFERS, fab.now_s())
    grid = fab.die_grid()
    return _ok(
        request,
        items,
        die_size_mm=fab.DIE_MM,
        x_range=[int(grid.x.min()), int(grid.x.max())],
        y_range=[int(grid.y.min()), int(grid.y.max())],
        dies_per_wafer=int(grid.x.size),
    )


@app.get("/featured", tags=["meta"])
async def featured(request: Request) -> Response:
    """Describes the planted excursion, so a demo presenter knows where to look."""
    start, end = fab.featured_window(fab.now_s())
    return _ok(
        request,
        [
            {
                "tool_id": fab.FEATURED_TOOL,
                "chamber": fab.FEATURED_CHAMBER,
                "parameter": fab.FEATURED_PARAMETER,
                "shift_sigma": fab.FEATURED_SHIFT_SIGMA,
                "start": _iso(start),
                "end": _iso(end),
                "effects": [
                    "CD_MEAN runs ~3 sigma high on that chamber (SPC out-of-control points)",
                    "Affected wafers show an edge ring in VTH/IDSAT wafer maps",
                    "Affected lots have lower yield_pct in /lots",
                ],
            }
        ],
    )

