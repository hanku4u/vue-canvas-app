import numpy as np
import pytest
from fastapi.testclient import TestClient

from mock_data_api.main import app

NOW = "2026-11-07T12:00:00Z"


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("MOCK_NOW", NOW)
    monkeypatch.setenv("MOCK_LATENCY_MS", "0")
    monkeypatch.setenv("MOCK_ERROR_RATE", "0")


@pytest.fixture
def client():
    return TestClient(app)


def items(response):
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["meta"]["count"] == len(body["data"]["items"])
    return body["data"]["items"]


def test_reference_endpoints(client):
    assert len(items(client.get("/tools", params={"area": "ETCH"}))) == 4
    params = items(client.get("/parameters", params={"level": "die"}))
    assert {p["parameter"] for p in params} == {"VTH", "IDSAT"}
    assert len(items(client.get("/steps"))) == 6
    assert len(items(client.get("/products"))) == 3


def test_spc_is_deterministic_and_lot_filter_is_a_subset(client):
    q = {"parameter": "CD_MEAN", "tool_ids": "ET-01,ET-02", "start": "2026-11-01", "end": "2026-11-03"}
    first = items(client.get("/spc/points", params=q))
    assert first == items(client.get("/spc/points", params=q))
    assert first and {r["tool_id"] for r in first} <= {"ET-01", "ET-02"}
    assert [r["ts"] for r in first] == sorted(r["ts"] for r in first)

    lot = first[0]["lot_id"]
    subset = items(client.get("/spc/points", params={**q, "lot_ids": lot}))
    expected = [r for r in first if r["lot_id"] == lot]
    assert subset == expected


def test_spc_wafer_level_is_site_mean(client):
    q = {"parameter": "THK_OX", "start": "2026-11-05", "end": "2026-11-05T06:00:00"}
    sites = items(client.get("/spc/points", params=q))
    wafers = items(client.get("/spc/points", params={**q, "level": "wafer"}))
    assert len(sites) == 9 * len(wafers)
    first = wafers[0]["wafer_id"]
    mean = np.mean([r["value"] for r in sites if r["wafer_id"] == first])
    assert wafers[0]["value"] == pytest.approx(mean, abs=1e-3)


def test_featured_excursion_shows_in_spc(client):
    rows = items(
        client.get(
            "/spc/points",
            params={"parameter": "CD_MEAN", "tool_ids": "ET-03", "start": "2026-10-29", "end": "2026-11-02", "level": "wafer"},
        )
    )
    chamber_c = [r for r in rows if r["chamber"] == "C"]
    others = [r for r in rows if r["chamber"] != "C"]
    ooc = np.mean([r["value"] > r["ucl"] for r in chamber_c])
    assert ooc > 0.7
    assert np.mean([r["value"] for r in chamber_c]) > np.mean([r["value"] for r in others]) + 1.0


def test_lots_and_history_agree(client):
    lots = items(client.get("/lots", params={"status": "COMPLETE", "limit": 5}))
    assert lots and all(l["status"] == "COMPLETE" and l["yield_pct"] is not None for l in lots)
    lot = lots[0]
    history = items(client.get("/lots/history", params={"lot_ids": lot["lot_id"]}))
    assert [h["status"] for h in history] == ["DONE"] * 6
    etch = next(h for h in history if h["area"] == "ETCH")
    assert etch["tool_id"] == lot["etch_tool"]


def test_lot_tool_filter(client):
    lots = items(client.get("/lots", params={"tool_ids": "LI-02"}))
    assert lots and all(l["litho_tool"] == "LI-02" for l in lots)


def test_wafer_dies(client):
    lot = items(client.get("/lots", params={"status": "COMPLETE", "limit": 1}))[0]["lot_id"]
    response = client.get("/wafers/dies", params={"lot_ids": lot, "parameter": "IDSAT"})
    rows = items(response)
    meta = response.json()["meta"]
    assert len(rows) == 25 * meta["dies_per_wafer"]
    assert len({(r["wafer_id"], r["x"], r["y"]) for r in rows}) == len(rows)
    assert all(meta["x_range"][0] <= r["x"] <= meta["x_range"][1] for r in rows)


def test_untested_wafers_have_no_dies(client):
    newest = items(client.get("/lots", params={"limit": 1}))[0]
    assert newest["status"] in ("QUEUED", "ACTIVE", "HOLD")
    assert items(client.get("/wafers/dies", params={"lot_ids": newest["lot_id"]})) == []


@pytest.mark.parametrize(
    ("path", "params", "status", "code"),
    [
        ("/spc/points", {"parameter": "NOPE"}, 400, "INVALID_PARAMETER"),
        ("/spc/points", {"parameter": "CD_MEAN", "tool_ids": "LI-01"}, 400, "INVALID_PARAMETER"),
        ("/spc/points", {"parameter": "CD_MEAN", "start": "2026-01-01", "end": "2026-11-01"}, 400, "RANGE_TOO_LARGE"),
        ("/spc/points", {"parameter": "CD_MEAN", "start": "2026-08-01", "end": "2026-11-07"}, 413, "RESULT_TOO_LARGE"),
        ("/wafers/dies", {}, 400, "INVALID_PARAMETER"),
        ("/lots", {"limit": 0}, 400, "INVALID_REQUEST"),
    ],
)
def test_errors_use_envelope(client, path, params, status, code):
    response = client.get(path, params=params)
    assert response.status_code == status
    assert response.json()["error"]["code"] == code


def test_forced_failure_header(client):
    response = client.get("/health", headers={"x-mock-fail": "504"})
    assert response.status_code == 504
    assert response.json()["error"]["code"] == "UPSTREAM_UNAVAILABLE"
