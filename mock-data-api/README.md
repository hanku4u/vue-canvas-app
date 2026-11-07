# mock-data-api

A local stand-in for the internal fab data API. It serves deterministic dummy data for a small fake fab, so the canvas app can be developed and demoed without access to real data.

## Run

```bash
cd mock-data-api
uv sync
uv run mock-data-api            # http://127.0.0.1:8001  (interactive docs at /docs)
```

## Test

```bash
uv run pytest
```

## Configuration

| Variable | Default | Effect |
| --- | --- | --- |
| `MOCK_HOST` / `MOCK_PORT` | `127.0.0.1` / `8001` | Bind address |
| `MOCK_RELOAD` | unset | `1` enables auto-reload |
| `MOCK_LATENCY_MS` | `150` | Simulated latency per request (randomized ±50%) |
| `MOCK_ERROR_RATE` | `0` | Fraction of requests that fail with 503 |
| `MOCK_NOW` | real time | Freeze "now" (ISO 8601) for reproducible demos and tests |
| `MOCK_LOT_INTERVAL_MIN` | `30` | Minutes between lot releases (smaller = more data) |
| `MOCK_DIE_MM` | `6` | Die size. 6 mm gives about 1,900 dies per 300 mm wafer |
| `MOCK_MAX_ROWS` | `500000` | Row limit before `413 RESULT_TOO_LARGE` |
| `MOCK_MAX_WAFERS` | `100` | Wafer limit for `/wafers/dies` |

Per-request headers: `x-mock-latency-ms: 3000` overrides latency, and `x-mock-fail: 503` forces a failure. These are useful for testing loading and error states.

The endpoint catalog, response format and the data story are in [docs/mock-data-api.md](../docs/mock-data-api.md).
