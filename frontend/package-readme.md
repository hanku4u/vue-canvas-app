# fab-canvas

An infinite-canvas workspace for semiconductor manufacturing engineers: SPC and trend charts, wafer maps, lot tables and notes, arranged freely, grouped, linked by shared filters, saved and shared per canvas, with per-component permissions and an admin area.

**This package is the frontend only.** You provide the backend: it implements the HTTP API in [`contract/openapi.yaml`](contract/openapi.yaml), with the rules in [`contract/api.md`](contract/api.md). Every response the UI receives in this project's CI is checked against that spec.

```bash
npm install fab-canvas
```

You can use it in two ways.

## 1. Serve the prebuilt app (no build step)

`node_modules/fab-canvas/dist/app/` is a complete static site. Serve it from your backend or any web server. Every path the app owns must return `index.html` (client-side routing).

```
dist/app/
  index.html     ← has <base href="/">; change it if you serve under a sub-path
  config.json    ← runtime settings (below); edit or serve your own
  assets/
```

Example: FastAPI serving the app at `/` and the API at `/api`:

```python
from pathlib import Path
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

APP = Path("node_modules/fab-canvas/dist/app")  # or copy it next to your backend
app = FastAPI()
# app.include_router(api_router, prefix="/api")   # your implementation of the contract

app.mount("/assets", StaticFiles(directory=APP / "assets"), name="assets")

@app.get("/{path:path}", include_in_schema=False)
def spa(path: str):
    file = APP / path
    return FileResponse(file if path and file.is_file() else APP / "index.html")
```

Under a sub-path such as `/tools/fab/`: set `<base href="/tools/fab/">` in `index.html` and serve the folder there.

## 2. Embed it in your own page

```js
import { mountApp } from 'fab-canvas'

const fab = mountApp('#fab-canvas', {
  apiBase: '/api',
  basePath: '/fab/', // the URL path this page lives under
})
// later: fab.unmount()
```

The module bundles everything it needs, Vue included, and loads heavy parts (tables, charts) on demand. A bundler isn't required: `<script type="module">` importing `node_modules/fab-canvas/dist/lib/fab-canvas.js` works too. The app uses its own router, so route every URL under `basePath` to your page. Give the container a height (the app fills it), e.g. `#fab-canvas { height: 100vh }`.

## Configuration

Set these in `config.json` (prebuilt app) or pass them to `mountApp` (embedded):

| Option | Default | |
| --- | --- | --- |
| `apiBase` | `/api` | Where your backend lives: a path on this origin, or an absolute URL (`https://fab.example.com/api`). |
| `basePath` | `<base href>` or `/` | URL path the app is served under. |
| `appName` | `Fab Canvas` | Shown in the top bar and the browser tab. |
| `headers` | `{}` | Extra headers on every API request. |
| `credentials` | `same-origin` | Fetch credentials mode; use `include` for a cross-origin API with cookies (and enable CORS with credentials). |

## Building the backend

- **Contract:** `contract/openapi.yaml` (OpenAPI 3.1) lists every endpoint, request and response the UI uses. Generate server stubs or validate your responses against it. `contract/api.md` explains the rules that a schema can't express: atomic ops batches with versions and conflicts, permissions, query shapes and caching.
- **Identity:** the UI sends no credentials of its own. Your gateway or proxy authenticates users and passes the user id to the backend in the `x-knox-id` header (rename it in your gateway if you like; the UI never reads it).
- **Types:** the package exports the TypeScript types for every request and response:
  ```ts
  import type { Canvas, CanvasOp, QueryRequest, QueryResult } from 'fab-canvas'
  ```
- **Datasets and filters** are defined by your backend (`GET /datasets`, `GET /filters`), so the UI adapts to your data without code changes.

## Versioning

The package follows semver. A change to `contract/openapi.yaml` that requires backend changes is a major version.

## License

MIT
