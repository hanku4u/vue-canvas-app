# frontend

The Vue 3 + TypeScript canvas app. The plan is in [docs/frontend-roadmap.md](../docs/frontend-roadmap.md) and the architecture in [docs/architecture.md](../docs/architecture.md).

## Develop

```bash
npm install
npm run dev:all     # Vite dev server (http://localhost:5173) + mock data API (:8001)
npm run dev         # Vite dev server only
```

In development, `/api` is served by an **in-browser mock of the FastAPI backend** (MSW, `src/mocks/`), switched on by `VITE_API_MOCK=1` in `.env.development`. To use a real FastAPI backend instead, create `.env.development.local` with `VITE_API_MOCK=0`. The dev server then proxies `/api` to `http://127.0.0.1:8000` (override with `API_PROXY_TARGET`).

**Dev identity:** the API client sends `x-knox-id` from `localStorage['dev.knoxId']` (default `j.doe`, an admin). Other seeded users are `k.lee`, `m.park` and `s.choi`. A user switcher UI arrives in F1.

## Check

| Command | What |
| --- | --- |
| `npm run lint:check` | oxlint + ESLint (`npm run lint` auto-fixes) |
| `npm run format:check` | Prettier (`npm run format` writes) |
| `npm run type-check` | vue-tsc |
| `npm run test:unit:run` | Vitest once (`npm run test:unit` watches) |
| `npx playwright test` | E2E against the dev server with MSW (first run: `npx playwright install chromium`) |
| `npm run build` | Type-check + production build (MSW is excluded from production builds) |

## Layout

```
src/
├── api/        API client (ApiError, dev identity), hand-written types from docs/api.md
├── app/        Theme, color scheme, query client, global styles
├── mocks/      MSW mock of FastAPI: handlers/, in-memory db, identity
├── pages/      Route pages
├── router/
└── test/       Vitest setup
```

Further folders (`canvas/`, `components/`, `registry/`, `filters/`, `data/`, `stores/`, `sync/`, `ui/`) are added by the milestones that need them.
