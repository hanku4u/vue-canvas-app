"""The fake fab: route steps, tools, parameters, products and the lot schedule.

Everything is deterministic. Values come from hashing (lot, wafer, site, ...) keys
rather than from a stateful RNG, so any subset of the data can be generated on its
own and always agrees with every other query.
"""

from __future__ import annotations

import os
import time
import zlib
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache

import numpy as np

# ---------------------------------------------------------------------------
# Time and scale
# ---------------------------------------------------------------------------

ANCHOR = datetime(2026, 1, 1, tzinfo=timezone.utc)
ANCHOR_S = int(ANCHOR.timestamp())
HOUR_S = 3_600
DAY_S = 86_400
WAFERS_PER_LOT = 25
WAFER_RADIUS_MM = 150.0
EDGE_EXCLUSION_MM = 3.0

# Control limits were "recalculated" on this date, so SPC charts show a limit step.
LIMIT_REVISION_S = int(datetime(2026, 9, 1, tzinfo=timezone.utc).timestamp())


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return default


LOT_INTERVAL_S = int(_env_float("MOCK_LOT_INTERVAL_MIN", 30) * 60)
DIE_MM = _env_float("MOCK_DIE_MM", 6.0)


def now_s() -> int:
    """Current time, overridable with MOCK_NOW (ISO 8601) for reproducible demos and tests."""
    fixed = os.environ.get("MOCK_NOW")
    if fixed:
        dt = datetime.fromisoformat(fixed.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp())
    return int(time.time())


# ---------------------------------------------------------------------------
# Static fab definition
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Step:
    step_id: str
    name: str
    area: str
    offset_h: float  # hours after lot release that the lot reaches this step (plus jitter)
    duration_h: float  # nominal time to process all 25 wafers

    @property
    def label(self) -> str:
        return f"{self.step_id}-{self.name}"


@dataclass(frozen=True)
class Tool:
    tool_id: str
    area: str
    chambers: tuple[str, ...]


@dataclass(frozen=True)
class Parameter:
    name: str
    step_id: str
    unit: str
    target: float
    sigma: float
    sites: int  # measurement sites per wafer (metrology); 0 for die-level test params
    level: str  # "site" (SPC metrology) or "die" (wafer sort)
    description: str


@dataclass(frozen=True)
class Product:
    letter: str
    product: str
    description: str
    weight: float


STEPS: tuple[Step, ...] = (
    Step("1000", "GATE-OX", "DIFF", 4, 3),
    Step("2000", "POLY-DEP", "CVD", 14, 2),
    Step("3000", "GATE-LITHO", "LITHO", 26, 2),
    Step("4000", "GATE-ETCH", "ETCH", 36, 2),
    Step("5000", "CMP", "CMP", 50, 2),
    Step("9000", "WAFER-SORT", "TEST", 140, 6),
)
STEP_BY_ID = {s.step_id: s for s in STEPS}
STEP_BY_AREA = {s.area: s for s in STEPS}

TOOLS: tuple[Tool, ...] = (
    Tool("DF-01", "DIFF", ("A", "B")),
    Tool("DF-02", "DIFF", ("A", "B")),
    Tool("CV-01", "CVD", ("A", "B", "C")),
    Tool("CV-02", "CVD", ("A", "B", "C")),
    Tool("CV-03", "CVD", ("A", "B", "C")),
    Tool("LI-01", "LITHO", ("A",)),
    Tool("LI-02", "LITHO", ("A",)),
    Tool("LI-03", "LITHO", ("A",)),
    Tool("ET-01", "ETCH", ("A", "B", "C", "D")),
    Tool("ET-02", "ETCH", ("A", "B", "C", "D")),
    Tool("ET-03", "ETCH", ("A", "B", "C", "D")),
    Tool("ET-04", "ETCH", ("A", "B", "C", "D")),
    Tool("CM-01", "CMP", ("A", "B")),
    Tool("CM-02", "CMP", ("A", "B")),
    Tool("TS-01", "TEST", ("A",)),
    Tool("TS-02", "TEST", ("A",)),
    Tool("TS-03", "TEST", ("A",)),
)
TOOL_BY_ID = {t.tool_id: t for t in TOOLS}
TOOLS_BY_AREA: dict[str, tuple[Tool, ...]] = {
    area: tuple(t for t in TOOLS if t.area == area) for area in STEP_BY_AREA
}

PARAMETERS: dict[str, Parameter] = {
    p.name: p
    for p in (
        Parameter("THK_OX", "1000", "A", 50.0, 0.4, 9, "site", "Gate oxide thickness"),
        Parameter("THK_POLY", "2000", "A", 1500.0, 10.0, 9, "site", "Poly-Si film thickness"),
        Parameter("CD_LITHO", "3000", "nm", 45.0, 0.5, 5, "site", "Resist CD after gate litho"),
        Parameter("OVL_X", "3000", "nm", 0.0, 2.0, 5, "site", "Overlay error, X"),
        Parameter("CD_MEAN", "4000", "nm", 40.0, 0.45, 9, "site", "Gate CD after etch"),
        Parameter("ETCH_DEPTH", "4000", "nm", 1500.0, 12.0, 5, "site", "Etch depth"),
        Parameter("THK_CMP", "5000", "A", 3000.0, 20.0, 9, "site", "Remaining film after CMP"),
        Parameter("VTH", "9000", "mV", 450.0, 6.0, 0, "die", "Threshold voltage"),
        Parameter("IDSAT", "9000", "uA/um", 620.0, 12.0, 0, "die", "Saturation drive current"),
    )
}

PRODUCTS: tuple[Product, ...] = (
    Product("A", "PRD-A100", "Logic test vehicle", 0.5),
    Product("B", "PRD-B200", "Mobile SoC", 0.3),
    Product("C", "PRD-C300", "Automotive MCU", 0.2),
)
_PRODUCT_CUM = np.cumsum([p.weight for p in PRODUCTS]) / sum(p.weight for p in PRODUCTS)
_PRODUCT_LETTERS = np.array([p.letter for p in PRODUCTS])

# The planted excursion that the demo is built around: a chamber running high at etch.
FEATURED_TOOL = "ET-03"
FEATURED_CHAMBER = "C"
FEATURED_PARAMETER = "CD_MEAN"
FEATURED_SHIFT_SIGMA = 3.0
FEATURED_DAYS_AGO = (10, 4)  # active from 10 days ago until 4 days ago (UTC day boundaries)


def featured_window(now: int) -> tuple[int, int]:
    today = now - now % DAY_S
    return today - FEATURED_DAYS_AGO[0] * DAY_S, today - FEATURED_DAYS_AGO[1] * DAY_S


# ---------------------------------------------------------------------------
# Deterministic hashing → uniform / normal values
# ---------------------------------------------------------------------------

_GOLDEN = np.uint64(0x9E3779B97F4A7C15)
_M1 = np.uint64(0xBF58476D1CE4E5B9)
_M2 = np.uint64(0x94D049BB133111EB)


def _splitmix(x):
    x = x + _GOLDEN
    x = (x ^ (x >> np.uint64(30))) * _M1
    x = (x ^ (x >> np.uint64(27))) * _M2
    return x ^ (x >> np.uint64(31))


def _as_u64(part) -> np.ndarray:
    if isinstance(part, str):
        return np.asarray(zlib.crc32(part.encode()), dtype=np.uint64)
    return np.asarray(part).astype(np.uint64)


def mix(*parts) -> np.ndarray:
    """Hash any mix of strings, ints and int arrays (broadcast together) to uint64."""
    with np.errstate(over="ignore"):
        x = np.zeros((), dtype=np.uint64)
        for part in parts:
            x = _splitmix(x ^ _as_u64(part))
        return np.asarray(x)


def uniform(*parts) -> np.ndarray:
    return (mix(*parts) >> np.uint64(11)).astype(np.float64) * (2.0**-53)


def normal(*parts) -> np.ndarray:
    u1 = uniform(*parts, "n1")
    u2 = uniform(*parts, "n2")
    return np.sqrt(-2.0 * np.log1p(-u1)) * np.cos(2.0 * np.pi * u2)


# ---------------------------------------------------------------------------
# Lot schedule
# ---------------------------------------------------------------------------


def max_lot_index(now: int) -> int:
    return max(-1, (now - ANCHOR_S) // LOT_INTERVAL_S)


def lot_release_s(k: np.ndarray) -> np.ndarray:
    jitter = (uniform(k, "release") * 0.8 * LOT_INTERVAL_S).astype(np.int64)
    return ANCHOR_S + k.astype(np.int64) * LOT_INTERVAL_S + jitter


def lot_product_idx(k: np.ndarray) -> np.ndarray:
    return np.searchsorted(_PRODUCT_CUM, uniform(k, "product"), side="right")


def lot_ids(k: np.ndarray) -> list[str]:
    letters = _PRODUCT_LETTERS[lot_product_idx(k)]
    return [f"{letter}{kk:06d}" for letter, kk in zip(letters.tolist(), k.tolist())]


def wafer_ids(k: np.ndarray, slot: np.ndarray) -> list[str]:
    return [f"{lot}.{s:02d}" for lot, s in zip(lot_ids(k), slot.tolist())]


def parse_lot_ids(ids: list[str], now: int) -> np.ndarray:
    """Turn lot IDs back into lot indices, dropping unknown or not-yet-released lots."""
    parsed = []
    for raw in ids:
        s = raw.strip().upper()
        if len(s) == 7 and s[0].isalpha() and s[1:].isdigit():
            parsed.append((int(s[1:]), s[0]))
    if not parsed:
        return np.array([], dtype=np.int64)
    k = np.array([p[0] for p in parsed], dtype=np.int64)
    letters = np.array([p[1] for p in parsed])
    valid = (k <= max_lot_index(now)) & (_PRODUCT_LETTERS[lot_product_idx(k)] == letters)
    k = k[valid]
    k = k[lot_release_s(k) <= now]
    return np.unique(k)


def parse_wafer_ids(ids: list[str], now: int) -> tuple[np.ndarray, np.ndarray]:
    ks, slots = [], []
    for raw in ids:
        lot, _, slot = raw.strip().upper().partition(".")
        if not slot.isdigit() or not 1 <= int(slot) <= WAFERS_PER_LOT:
            continue
        k = parse_lot_ids([lot], now)
        if k.size:
            ks.append(int(k[0]))
            slots.append(int(slot))
    pairs = sorted(set(zip(ks, slots)))
    return (
        np.array([p[0] for p in pairs], dtype=np.int64),
        np.array([p[1] for p in pairs], dtype=np.int64),
    )


def step_track_in_s(k: np.ndarray, step: Step) -> np.ndarray:
    jitter = (uniform(k, step.step_id, "track-in") * 4 * HOUR_S).astype(np.int64)
    return lot_release_s(k) + int(step.offset_h * HOUR_S) + jitter


def step_track_out_s(k: np.ndarray, step: Step) -> np.ndarray:
    duration = step.duration_h * HOUR_S * (1.0 + 0.2 * uniform(k, step.step_id, "duration"))
    return step_track_in_s(k, step) + duration.astype(np.int64)


def wafer_ts_s(k: np.ndarray, slot: np.ndarray, step: Step) -> np.ndarray:
    """When wafer `slot` of lot `k` was processed at `step` (wafers run in slot order)."""
    t_in = step_track_in_s(k, step)
    t_out = step_track_out_s(k, step)
    return t_in + (slot - 1) * (t_out - t_in) // WAFERS_PER_LOT


def step_tool_idx(k: np.ndarray, step: Step) -> np.ndarray:
    n_tools = len(TOOLS_BY_AREA[step.area])
    return (mix(k, step.step_id, "tool") % np.uint64(n_tools)).astype(np.int64)


def wafer_chamber_idx(k: np.ndarray, slot: np.ndarray, step: Step) -> np.ndarray:
    n_chambers = len(TOOLS_BY_AREA[step.area][0].chambers)
    return (mix(k, slot, step.step_id, "chamber") % np.uint64(n_chambers)).astype(np.int64)


def candidate_lots_for_step(step: Step, start: int, end: int, now: int) -> np.ndarray:
    """Lot indices that could have been at `step` between start and end."""
    offset = int(step.offset_h * HOUR_S)
    max_jitter = 4 * HOUR_S + LOT_INTERVAL_S + int(step.duration_h * 1.2 * HOUR_S)
    lo = (start - offset - max_jitter - ANCHOR_S) // LOT_INTERVAL_S
    hi = (end - offset - ANCHOR_S) // LOT_INTERVAL_S + 1
    lo, hi = max(lo, 0), min(hi, max_lot_index(now))
    return np.arange(lo, hi + 1, dtype=np.int64) if hi >= lo else np.array([], dtype=np.int64)


# ---------------------------------------------------------------------------
# Wafer die grid
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class DieGrid:
    x: np.ndarray  # non-negative integer die column
    y: np.ndarray  # non-negative integer die row
    x_mm: np.ndarray
    y_mm: np.ndarray
    r: np.ndarray  # die centre radius, normalised to the usable radius (0..1)


@lru_cache(maxsize=1)
def die_grid() -> DieGrid:
    usable = WAFER_RADIUS_MM - EDGE_EXCLUSION_MM
    n = int(np.ceil(WAFER_RADIUS_MM / DIE_MM))
    i, j = np.meshgrid(np.arange(-n, n + 1), np.arange(-n, n + 1), indexing="xy")
    i, j = i.ravel(), j.ravel()
    x_mm, y_mm = i * DIE_MM, j * DIE_MM
    inside = np.hypot(np.abs(x_mm) + DIE_MM / 2, np.abs(y_mm) + DIE_MM / 2) <= usable
    i, j, x_mm, y_mm = i[inside], j[inside], x_mm[inside], y_mm[inside]
    return DieGrid(
        x=(i + n).astype(np.int64),
        y=(j + n).astype(np.int64),
        x_mm=x_mm.astype(np.float64),
        y_mm=y_mm.astype(np.float64),
        r=np.hypot(x_mm, y_mm) / usable,
    )
