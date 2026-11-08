# Packaging: the `fab-canvas` npm package

The frontend ships as an npm package **without any backend code**, so it can be installed elsewhere and run against a backend you build to the API contract.

## What's in the package

| Path | |
| --- | --- |
| `dist/app/` | The prebuilt static app: `index.html` (with an editable `<base href>`), `config.json`, `assets/`. Serve it from any web server with an SPA fallback. |
| `dist/lib/fab-canvas.js` + `style.css` | `mountApp(el, config)` for embedding in your own page. One ES module with lazy chunks; Vue and every other dependency are bundled, so it works with or without a bundler. |
| `dist/types/` | TypeScript declarations: `FabCanvasConfig`, `MountedFabCanvas`, and every API request/response type (`Canvas`, `CanvasOp`, `QueryRequest`, …). |
| `contract/openapi.yaml` | The backend contract (OpenAPI 3.1). |
| `contract/api.md` | The rules behind it (docs/api.md). |

**Not included:** the mock backend (MSW handlers, the dev identity switcher and dev menu items, the `mockServiceWorker.js` worker) and `mock-data-api/`. Production builds drop all of it (`VITE_API_MOCK` is unset), and `verify:package` checks the result.

The consumer-facing guide is the package README (`frontend/package-readme.md`).

## Runtime configuration

Nothing about the deployment is baked in at build time. `src/app/config.ts` defines `FabCanvasConfig`:
- `apiBase`: path or absolute URL of the API
- `basePath`: the URL path the app is served under
- `appName`
- `headers`: extra request headers
- `credentials`: the fetch credentials mode

The prebuilt app reads `config.json` (relative to `<base href>`) at startup (`main.ts`). The embedded form takes the same object in `mountApp()` (`src/lib.ts`). Both go through `createFabCanvasApp()` (`src/app/createFabCanvasApp.ts`), which `npm run dev` uses too.

## The contract stays honest

`frontend/contract/openapi.yaml` is checked three ways:
- `src/api/__tests__/contract.spec.ts`: every schema and `$ref` compiles (Ajv, JSON Schema 2020-12), and the spec lists exactly the endpoints the reference mock implements.
- `e2e/contract.spec.ts`: a tour of the whole app validates **every request body the UI sends and every JSON response it receives** against the spec. A backend that implements the spec therefore serves the shapes the UI is tested against.
- `npm run verify:package` installs the packed tarball into a scratch project, type-checks a consumer file against the exported types, then runs both forms in Chromium against a fake backend. The prebuilt app runs under a sub-path; `mountApp()` runs from a plain HTML page without a bundler. Both use a custom `apiBase` and headers.

When the API changes, update `openapi.yaml`, `docs/api.md`, `src/api/types.ts` and the mock together. CI fails if they drift.

## Building and releasing

```bash
cd frontend
npm run build:package    # → frontend/package/ (git-ignored)
npm run verify:package   # consumer smoke test
```

The package name, license and repository come from `fabCanvasPackage` in `frontend/package.json`, and the version from its `version`. CI builds and verifies the package on every push.

Publishing uses npm **trusted publishing**: GitHub Actions authenticates to npm with a short-lived OIDC identity, so there is no stored token and no 2FA prompt, and provenance is attached automatically. npm only lets you configure a trusted publisher on a package that already exists, so the first release is manual.

**First release (once, from your machine):**

```bash
cd frontend
npm login                       # your npm account; 2FA as usual
npm run build:package
npm run verify:package
npm publish ./package --access public   # asks for your 2FA code
```

**Then connect GitHub Actions:** on npmjs.com, go to the package → Settings → Trusted publishing and add a GitHub Actions publisher with:
- owner `hanku4u`
- repository `vue-canvas-app`
- workflow `publish.yml`
- no environment

Optionally, set "Publishing access" to require 2FA and disallow tokens, so only the workflow (and you, with 2FA) can publish.

**Every release after that:**
1. Bump `version` in `frontend/package.json`. Semver: a contract change that requires backend changes is a major version.
2. Commit, then push a tag `v<version>`, e.g. `git tag v0.2.0 && git push origin v0.2.0`.
3. `.github/workflows/publish.yml` checks that the tag matches the version, runs the tests, builds and verifies the package, and publishes it.

To see what would be published without publishing, run the workflow by hand with "dry run" checked.
