# vue-canvas-app

An infinite-canvas workspace for semiconductor manufacturing engineers. Pick data components (charts, wafer maps, tables, notes), arrange and group them freely, link them with shared filters, and save and share the result.

This is a demonstration application. Data comes from a local mock data API, not real fab systems.

| Path | What |
| --- | --- |
| [docs/](docs/README.md) | Scope, architecture, UX, permissions, API contract, design decisions |
| [mock-data-api/](mock-data-api/README.md) | Local dummy data API (FastAPI) with a deterministic fake fab |

## Quick start (mock data API)

```bash
cd mock-data-api
uv sync
uv run mock-data-api   # http://127.0.0.1:8001/docs
```
