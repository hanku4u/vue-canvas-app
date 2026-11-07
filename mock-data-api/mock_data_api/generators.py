"""Data generators behind each endpoint. All return lists of plain dict rows."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from . import fab
from .fab import DAY_S, HOUR_S, PARAMETERS, STEPS, WAFERS_PER_LOT, Parameter, Step


class DataError(Exception):
    """A request the fake fab can't answer (bad parameter, too much data, ...)."""

    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def iso(ts: np.ndarray) -> list[str]:
    strings = np.datetime_as_string(np.asarray(ts, dtype="datetime64[s]"), unit="s")
    return [s + "Z" for s in strings.tolist()]


def iso_or_none(ts: np.ndarray, present: np.ndarray) -> list[str | None]:
    return [s if p else None for s, p in zip(iso(ts), present.tolist())]


def records(columns: dict[str, list]) -> list[dict]:
    keys = list(columns)
    return [dict(zip(keys, row)) for row in zip(*columns.values())]


def rounded(values: np.ndarray, digits: int = 4) -> list[float]:
    return np.round(values, digits).tolist()


def _area_tools(step: Step) -> list[str]:
    return [t.tool_id for t in fab.TOOLS_BY_AREA[step.area]]


def _tool_indices(step: Step, tool_ids: list[str]) -> np.ndarray:
    names = _area_tools(step)
    if not tool_ids:
        return np.arange(len(names))
    unknown = [t for t in tool_ids if t not in names]
    if unknown:
        raise DataError(
            400,
            "INVALID_PARAMETER",
            f"Tools {unknown} do not run step {step.label}. Valid tools: {names}",
        )
    return np.array([names.index(t) for t in tool_ids])


def _parameter(name: str, level: str) -> Parameter:
    param = PARAMETERS.get(name.upper())
    if param is None or param.level != level:
        valid = [p.name for p in PARAMETERS.values() if p.level == level]
        raise DataError(400, "INVALID_PARAMETER", f"Unknown {level}-level parameter '{name}'. Valid: {valid}")
    return param


# ---------------------------------------------------------------------------
# Metrology (SPC) values
# ---------------------------------------------------------------------------


def metrology_values(
    param: Parameter,
    k: np.ndarray,
    slot: np.ndarray,
    tool_idx: np.ndarray,
    chamber_idx: np.ndarray,
    ts: np.ndarray,
    now: int,
) -> np.ndarray:
    """Site-level measurements, shape (n_wafers, param.sites)."""
    step = fab.STEP_BY_ID[param.step_id]
    tools = fab.TOOLS_BY_AREA[step.area]
    n_chambers = len(tools[0].chambers)
    sigma, key = param.sigma, param.name

    tool_offset = fab.normal("tool", key, tool_idx) * 0.4 * sigma
    chamber_offset = fab.normal("chamber", key, tool_idx, chamber_idx) * 0.3 * sigma
    phase = fab.uniform("phase", key, tool_idx) * 2 * np.pi
    drift = 0.5 * sigma * np.sin(2 * np.pi * (ts - fab.ANCHOR_S) / (18 * DAY_S) + phase)
    lot_effect = fab.normal("lot", key, k) * 0.35 * sigma
    wafer_effect = fab.normal("wafer", key, k, slot) * 0.25 * sigma

    # Random short excursions: some days, one chamber of a tool shifts for a few hours.
    day = (ts - fab.ANCHOR_S) // DAY_S
    second_of_day = (ts - fab.ANCHOR_S) % DAY_S
    has_event = fab.uniform("event", key, tool_idx, day) < 0.06
    ev_start = fab.uniform("event-start", key, tool_idx, day) * 18 * HOUR_S
    ev_length = (4 + 8 * fab.uniform("event-length", key, tool_idx, day)) * HOUR_S
    ev_chamber = (fab.mix("event-chamber", key, tool_idx, day) % np.uint64(n_chambers)).astype(np.int64)
    ev_sign = np.where(fab.uniform("event-sign", key, tool_idx, day) < 0.5, -1.0, 1.0)
    ev_size = (2.5 + 1.5 * fab.uniform("event-size", key, tool_idx, day)) * sigma
    in_event = (
        has_event
        & (chamber_idx == ev_chamber)
        & (second_of_day >= ev_start)
        & (second_of_day < ev_start + ev_length)
    )
    shift = np.where(in_event, ev_sign * ev_size, 0.0)

    if param.name == fab.FEATURED_PARAMETER:
        shift = shift + np.where(_featured_mask(tool_idx, chamber_idx, ts, now), fab.FEATURED_SHIFT_SIGMA * sigma, 0.0)

    wafer_level = param.target + tool_offset + chamber_offset + drift + lot_effect + wafer_effect + shift

    sites = np.arange(param.sites)
    site_profile = fab.normal("site", key, sites) * 0.3 * sigma
    site_profile -= site_profile.mean()
    noise = fab.normal("noise", key, k[:, None], slot[:, None], sites[None, :]) * 0.6 * sigma
    return wafer_level[:, None] + site_profile[None, :] + noise


def _featured_mask(tool_idx: np.ndarray, chamber_idx: np.ndarray, ts: np.ndarray, now: int) -> np.ndarray:
    step = fab.STEP_BY_AREA["ETCH"]
    tools = _area_tools(step)
    chambers = fab.TOOL_BY_ID[fab.FEATURED_TOOL].chambers
    start, end = fab.featured_window(now)
    return (
        (tool_idx == tools.index(fab.FEATURED_TOOL))
        & (chamber_idx == chambers.index(fab.FEATURED_CHAMBER))
        & (ts >= start)
        & (ts < end)
    )


def control_limits(param: Parameter, ts: np.ndarray, level: str) -> dict[str, np.ndarray]:
    sigma_c = param.sigma * (1.0 if level == "site" else 0.75)
    factor = np.where(ts >= fab.LIMIT_REVISION_S, 0.9, 1.0)
    n = ts.shape[0]
    return {
        "target": np.full(n, param.target),
        "ucl": param.target + 3 * sigma_c * factor,
        "lcl": param.target - 3 * sigma_c * factor,
        "usl": np.full(n, param.target + 6 * param.sigma),
        "lsl": np.full(n, param.target - 6 * param.sigma),
    }


@dataclass
class _WaferSet:
    k: np.ndarray
    slot: np.ndarray
    tool_idx: np.ndarray
    chamber_idx: np.ndarray
    ts: np.ndarray


def _wafers_at_step(step: Step, k: np.ndarray, tool_idx_filter: np.ndarray | None, now: int) -> _WaferSet:
    tool_idx = fab.step_tool_idx(k, step)
    if tool_idx_filter is not None:
        keep = np.isin(tool_idx, tool_idx_filter)
        k, tool_idx = k[keep], tool_idx[keep]
    k_w = np.repeat(k, WAFERS_PER_LOT)
    slot = np.tile(np.arange(1, WAFERS_PER_LOT + 1), k.size)
    tool_w = np.repeat(tool_idx, WAFERS_PER_LOT)
    ts = fab.wafer_ts_s(k_w, slot, step) if k_w.size else np.array([], dtype=np.int64)
    done = ts <= now
    k_w, slot, tool_w, ts = k_w[done], slot[done], tool_w[done], ts[done]
    chamber = fab.wafer_chamber_idx(k_w, slot, step) if k_w.size else np.array([], dtype=np.int64)
    return _WaferSet(k_w, slot, tool_w, chamber, ts)


# ---------------------------------------------------------------------------
# /spc/points
# ---------------------------------------------------------------------------


def spc_points(
    parameter: str,
    tool_ids: list[str],
    start: int,
    end: int,
    lot_ids: list[str],
    level: str,
    max_rows: int,
    now: int,
) -> list[dict]:
    param = _parameter(parameter, "site")
    step = fab.STEP_BY_ID[param.step_id]
    tool_filter = _tool_indices(step, tool_ids)

    k = fab.parse_lot_ids(lot_ids, now) if lot_ids else fab.candidate_lots_for_step(step, start, end, now)
    wafers = _wafers_at_step(step, k, tool_filter, now)
    in_range = (wafers.ts >= start) & (wafers.ts <= end)
    w = _WaferSet(*(a[in_range] for a in (wafers.k, wafers.slot, wafers.tool_idx, wafers.chamber_idx, wafers.ts)))

    n_rows = w.k.size * (param.sites if level == "site" else 1)
    if n_rows > max_rows:
        raise DataError(
            413,
            "RESULT_TOO_LARGE",
            f"Query would return {n_rows:,} rows (limit {max_rows:,}). Narrow the time range or tools.",
        )
    if w.k.size == 0:
        return []

    order = np.argsort(w.ts, kind="stable")
    w = _WaferSet(*(a[order] for a in (w.k, w.slot, w.tool_idx, w.chamber_idx, w.ts)))
    values = metrology_values(param, w.k, w.slot, w.tool_idx, w.chamber_idx, w.ts, now)

    tools = np.array(_area_tools(step))
    chambers = np.array(fab.TOOLS_BY_AREA[step.area][0].chambers)
    lots = fab.lot_ids(w.k)
    wafer_id = [f"{lot}.{s:02d}" for lot, s in zip(lots, w.slot.tolist())]
    products = [fab.PRODUCTS[i].product for i in fab.lot_product_idx(w.k).tolist()]

    if level == "wafer":
        values = values.mean(axis=1)
        site = [None] * w.k.size
        rep = 1
    else:
        rep = param.sites
        site = np.tile(np.arange(1, param.sites + 1), w.k.size).tolist()
        values = values.ravel()

    def r(seq):
        return [x for x in seq for _ in range(rep)] if rep > 1 else list(seq)

    ts = np.repeat(w.ts, rep)
    limits = control_limits(param, ts, level)
    return records(
        {
            "ts": iso(ts),
            "parameter": [param.name] * ts.size,
            "unit": [param.unit] * ts.size,
            "step": [step.label] * ts.size,
            "tool_id": r(tools[w.tool_idx].tolist()),
            "chamber": r(chambers[w.chamber_idx].tolist()),
            "product": r(products),
            "lot_id": r(lots),
            "wafer_id": r(wafer_id),
            "slot": r(w.slot.tolist()),
            "site": site,
            "value": rounded(values),
            **{name: rounded(arr) for name, arr in limits.items()},
        }
    )


# ---------------------------------------------------------------------------
# /lots
# ---------------------------------------------------------------------------

STATUSES = ("QUEUED", "ACTIVE", "HOLD", "COMPLETE")


def _lot_route(k: np.ndarray, now: int) -> dict[str, dict[str, np.ndarray]]:
    route = {}
    for step in STEPS:
        t_in = fab.step_track_in_s(k, step)
        route[step.step_id] = {
            "track_in": t_in,
            "track_out": fab.step_track_out_s(k, step),
            "tool_idx": fab.step_tool_idx(k, step),
            "started": t_in <= now,
        }
    return route


def _featured_chamber_fraction(k: np.ndarray, route, now: int) -> np.ndarray:
    """Fraction of each lot's wafers that went through the featured chamber during the excursion."""
    step = fab.STEP_BY_AREA["ETCH"]
    slots = np.arange(1, WAFERS_PER_LOT + 1)
    kk = np.repeat(k, WAFERS_PER_LOT)
    ss = np.tile(slots, k.size)
    tool_idx = np.repeat(route[step.step_id]["tool_idx"], WAFERS_PER_LOT)
    ts = fab.wafer_ts_s(kk, ss, step)
    mask = _featured_mask(tool_idx, fab.wafer_chamber_idx(kk, ss, step), ts, now) & (ts <= now)
    return mask.reshape(k.size, WAFERS_PER_LOT).mean(axis=1)


def lots(
    start: int,
    end: int,
    products: list[str],
    tool_ids: list[str],
    prefix: str | None,
    statuses: list[str],
    limit: int,
    now: int,
) -> list[dict]:
    lo = max((start - fab.ANCHOR_S) // fab.LOT_INTERVAL_S - 1, 0)
    hi = min((end - fab.ANCHOR_S) // fab.LOT_INTERVAL_S, fab.max_lot_index(now))
    k = np.arange(lo, hi + 1, dtype=np.int64) if hi >= lo else np.array([], dtype=np.int64)
    release = fab.lot_release_s(k)
    keep = (release >= start) & (release <= end) & (release <= now)
    k, release = k[keep], release[keep]

    product_idx = fab.lot_product_idx(k)
    if products:
        wanted = [i for i, p in enumerate(fab.PRODUCTS) if p.product in products]
        keep = np.isin(product_idx, wanted)
        k, release, product_idx = k[keep], release[keep], product_idx[keep]

    ids = np.array(fab.lot_ids(k), dtype=object)
    if prefix:
        keep = np.array([s.startswith(prefix.upper()) for s in ids], dtype=bool)
        k, release, product_idx, ids = k[keep], release[keep], product_idx[keep], ids[keep]

    route = _lot_route(k, now)
    tool_names = {
        step.step_id: np.array(_area_tools(step), dtype=object)[route[step.step_id]["tool_idx"]] for step in STEPS
    }
    if tool_ids:
        keep = np.zeros(k.size, dtype=bool)
        for step in STEPS:
            keep |= route[step.step_id]["started"] & np.isin(tool_names[step.step_id], tool_ids)
        k, release, product_idx, ids = k[keep], release[keep], product_idx[keep], ids[keep]
        route = _lot_route(k, now)
        tool_names = {s: names[keep] for s, names in tool_names.items()}

    n_started = sum(route[s.step_id]["started"].astype(int) for s in STEPS) if k.size else np.zeros(0, int)
    test = route[STEPS[-1].step_id]
    complete = test["track_out"] <= now
    hold = (fab.uniform(k, "hold") < 0.04) & ~complete & (n_started > 0)
    status = np.where(complete, "COMPLETE", np.where(n_started == 0, "QUEUED", np.where(hold, "HOLD", "ACTIVE")))

    yield_pct = 93.0 + fab.normal(k, "yield") * 1.8 - 30.0 * _featured_chamber_fraction(k, route, now)
    yield_pct = np.clip(yield_pct, 0, 100)
    u_priority = fab.uniform(k, "priority")
    priority = np.where(u_priority < 0.1, 1, np.where(u_priority < 0.4, 2, 3))

    if statuses:
        keep = np.isin(status, [s.upper() for s in statuses])
    else:
        keep = np.ones(k.size, dtype=bool)

    order = np.argsort(-release, kind="stable")
    order = order[keep[order]][:limit]

    rows = []
    for i in order.tolist():
        current = STEPS[max(n_started[i] - 1, 0)]
        row = {
            "lot_id": ids[i],
            "product": fab.PRODUCTS[product_idx[i]].product,
            "release_ts": iso(release[i : i + 1])[0],
            "status": str(status[i]),
            "current_step": current.label if n_started[i] else None,
            "current_tool": str(tool_names[current.step_id][i]) if n_started[i] else None,
            "wafer_count": WAFERS_PER_LOT,
            "priority": int(priority[i]),
            "yield_pct": round(float(yield_pct[i]), 2) if complete[i] else None,
        }
        for step in STEPS:
            started = bool(route[step.step_id]["started"][i])
            row[f"{step.area.lower()}_tool"] = str(tool_names[step.step_id][i]) if started else None
        rows.append(row)
    return rows


# ---------------------------------------------------------------------------
# /lots/history
# ---------------------------------------------------------------------------


def lot_history(lot_ids: list[str], now: int) -> list[dict]:
    k = fab.parse_lot_ids(lot_ids, now)
    if k.size == 0:
        return []
    route = _lot_route(k, now)
    ids = fab.lot_ids(k)
    products = [fab.PRODUCTS[i].product for i in fab.lot_product_idx(k).tolist()]
    slots = np.arange(1, WAFERS_PER_LOT + 1)

    rows = []
    for i in range(k.size):
        for step in STEPS:
            r = route[step.step_id]
            started = bool(r["started"][i])
            done = bool(r["track_out"][i] <= now)
            chambers = None
            if started:
                ch_idx = fab.wafer_chamber_idx(np.full(WAFERS_PER_LOT, k[i]), slots, step)
                names = fab.TOOLS_BY_AREA[step.area][0].chambers
                chambers = ",".join(sorted({names[c] for c in ch_idx.tolist()}))
            rows.append(
                {
                    "lot_id": ids[i],
                    "product": products[i],
                    "step": step.label,
                    "area": step.area,
                    "tool_id": _area_tools(step)[r["tool_idx"][i]] if started else None,
                    "chambers": chambers,
                    "track_in": iso(r["track_in"][i : i + 1])[0] if started else None,
                    "track_out": iso(r["track_out"][i : i + 1])[0] if done else None,
                    "status": "DONE" if done else ("RUNNING" if started else "PENDING"),
                    "wafer_count": WAFERS_PER_LOT,
                }
            )
    return rows


# ---------------------------------------------------------------------------
# /wafers
# ---------------------------------------------------------------------------


def wafers(lot_ids: list[str], now: int) -> list[dict]:
    k = fab.parse_lot_ids(lot_ids, now)
    if k.size == 0:
        return []
    kk = np.repeat(k, WAFERS_PER_LOT)
    ss = np.tile(np.arange(1, WAFERS_PER_LOT + 1), k.size)
    etch, test = fab.STEP_BY_AREA["ETCH"], fab.STEP_BY_AREA["TEST"]
    etch_ts, test_ts = fab.wafer_ts_s(kk, ss, etch), fab.wafer_ts_s(kk, ss, test)
    etch_tool = np.array(_area_tools(etch))[np.repeat(fab.step_tool_idx(k, etch), WAFERS_PER_LOT)]
    etch_chamber = np.array(fab.TOOLS_BY_AREA["ETCH"][0].chambers)[fab.wafer_chamber_idx(kk, ss, etch)]
    etched = etch_ts <= now
    tested = test_ts <= now
    lots_ = fab.lot_ids(kk)
    return records(
        {
            "lot_id": lots_,
            "wafer_id": [f"{lot}.{s:02d}" for lot, s in zip(lots_, ss.tolist())],
            "slot": ss.tolist(),
            "etch_tool": [t if e else None for t, e in zip(etch_tool.tolist(), etched.tolist())],
            "etch_chamber": [c if e else None for c, e in zip(etch_chamber.tolist(), etched.tolist())],
            "etch_ts": iso_or_none(etch_ts, etched),
            "tested": tested.tolist(),
            "test_ts": iso_or_none(test_ts, tested),
        }
    )


# ---------------------------------------------------------------------------
# /wafers/dies
# ---------------------------------------------------------------------------


def wafer_dies(parameter: str, lot_ids: list[str], wafer_ids: list[str], max_wafers: int, now: int) -> list[dict]:
    param = _parameter(parameter, "die")

    pairs: set[tuple[int, int]] = set()
    for kk in fab.parse_lot_ids(lot_ids, now).tolist():
        pairs.update((kk, s) for s in range(1, WAFERS_PER_LOT + 1))
    wk, ws = fab.parse_wafer_ids(wafer_ids, now)
    pairs.update(zip(wk.tolist(), ws.tolist()))
    if len(pairs) > max_wafers:
        raise DataError(
            413,
            "TOO_MANY_WAFERS",
            f"Request covers {len(pairs)} wafers (limit {max_wafers}). Request fewer lots or wafers.",
        )
    if not pairs:
        return []

    ordered = sorted(pairs)
    k = np.array([p[0] for p in ordered], dtype=np.int64)
    slot = np.array([p[1] for p in ordered], dtype=np.int64)

    test = fab.STEP_BY_AREA["TEST"]
    test_ts = fab.wafer_ts_s(k, slot, test)
    tested = test_ts <= now
    k, slot, test_ts = k[tested], slot[tested], test_ts[tested]
    if k.size == 0:
        return []

    # Upstream etch result drives the test result: wider gate CD → higher VTH, lower IDSAT.
    etch = fab.STEP_BY_AREA["ETCH"]
    cd_param = PARAMETERS["CD_MEAN"]
    etch_tool = fab.step_tool_idx(k, etch)
    etch_chamber = fab.wafer_chamber_idx(k, slot, etch)
    etch_ts = fab.wafer_ts_s(k, slot, etch)
    cd = metrology_values(cd_param, k, slot, etch_tool, etch_chamber, etch_ts, now).mean(axis=1)
    cd_z = (cd - cd_param.target) / cd_param.sigma
    featured = _featured_mask(etch_tool, etch_chamber, etch_ts, now)

    grid = fab.die_grid()
    r = grid.r[None, :]
    usable = fab.WAFER_RADIUS_MM - fab.EDGE_EXCLUSION_MM
    x_n, y_n = grid.x_mm[None, :] / usable, grid.y_mm[None, :] / usable
    sigma, key = param.sigma, param.name
    sign = 1.0 if key == "VTH" else -1.0
    kc, sc = k[:, None], slot[:, None]

    wafer_level = (
        param.target + sign * 1.2 * sigma * cd_z + fab.normal("wafer-level", key, k, slot) * 0.4 * sigma
    )[:, None]
    bowl = sign * (0.6 + 0.4 * fab.normal("bowl", key, kc, sc)) * sigma * r**2
    tilt_angle = fab.uniform("tilt-angle", key, kc, sc) * 2 * np.pi
    tilt = fab.normal("tilt", key, kc, sc) * 0.3 * sigma * (x_n * np.cos(tilt_angle) + y_n * np.sin(tilt_angle))
    edge = np.where(r > 0.85, -sign * ((r - 0.85) / 0.15) ** 2 * 1.5 * sigma, 0.0)
    ring = np.where(featured[:, None], sign * 4.0 * sigma * np.exp(-(((r - 0.88) / 0.06) ** 2)), 0.0)

    has_spot = fab.uniform("spot", key, kc, sc) < 0.12
    spot_r = np.sqrt(fab.uniform("spot-r", key, kc, sc)) * 0.8
    spot_a = fab.uniform("spot-a", key, kc, sc) * 2 * np.pi
    spot_d2 = (x_n - spot_r * np.cos(spot_a)) ** 2 + (y_n - spot_r * np.sin(spot_a)) ** 2
    spot = np.where(has_spot, 3.0 * sigma * np.exp(-spot_d2 / (2 * 0.08**2)), 0.0)

    die_idx = np.arange(grid.x.size)[None, :]
    noise = fab.normal("die", key, kc, sc, die_idx) * 0.5 * sigma
    values = wafer_level + bowl + tilt + edge + ring + spot + noise  # (wafers, dies)

    n_dies = grid.x.size
    lots_ = fab.lot_ids(k)
    test_tool = np.array(_area_tools(test))[fab.step_tool_idx(k, test)]
    ts_iso = iso(test_ts)

    def rep(seq):
        return [x for x in seq for _ in range(n_dies)]

    return records(
        {
            "lot_id": rep(lots_),
            "wafer_id": rep(f"{lot}.{s:02d}" for lot, s in zip(lots_, slot.tolist())),
            "slot": rep(slot.tolist()),
            "x": np.tile(grid.x, k.size).tolist(),
            "y": np.tile(grid.y, k.size).tolist(),
            "parameter": [key] * values.size,
            "unit": [param.unit] * values.size,
            "value": rounded(values.ravel(), 3),
            "test_tool": rep(test_tool.tolist()),
            "test_ts": rep(ts_iso),
        }
    )
