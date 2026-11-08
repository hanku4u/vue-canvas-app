/**
 * Runtime configuration (the npm package's settings, docs/packaging.md). Set once at
 * startup: from `config.json` next to the prebuilt app, or from `mountApp(el, config)`.
 * Nothing here is baked in at build time.
 */
export interface FabCanvasConfig {
  /**
   * Where the backend API lives: a path on this origin (default `/api`) or an absolute
   * URL (`https://fab.example.com/api`). Endpoints are appended: `${apiBase}/canvases`.
   */
  apiBase?: string
  /**
   * URL path the app is served under, for client-side routes (default: the page's
   * `<base href>` in the prebuilt app, else `/`). E.g. `/tools/fab-canvas/`.
   */
  basePath?: string
  /** Product name in the top bar and browser tab (default "Fab Canvas"). */
  appName?: string
  /** Extra headers sent with every API request (e.g. a gateway key). */
  headers?: Record<string, string>
  /**
   * Cookie mode for API requests (fetch `credentials`, default `same-origin`). Use
   * `include` when the API is on another origin and authenticates with cookies.
   */
  credentials?: RequestCredentials
}

export type ResolvedConfig = Required<Omit<FabCanvasConfig, 'headers'>> & {
  headers: Record<string, string>
}

const DEFAULTS: ResolvedConfig = {
  apiBase: '/api',
  basePath: '/',
  appName: 'Fab Canvas',
  headers: {},
  credentials: 'same-origin',
}

let current: ResolvedConfig = { ...DEFAULTS }

/** Apply configuration (unset fields keep their defaults). */
export function configure(config: FabCanvasConfig = {}): ResolvedConfig {
  const defined = Object.fromEntries(
    Object.entries(config).filter(([, v]) => v !== undefined && v !== null),
  ) as FabCanvasConfig
  current = {
    ...DEFAULTS,
    ...defined,
    apiBase: (defined.apiBase ?? DEFAULTS.apiBase).replace(/\/+$/, ''),
    basePath: normalizeBasePath(defined.basePath ?? DEFAULTS.basePath),
    headers: { ...defined.headers },
  }
  return current
}

export function getConfig(): ResolvedConfig {
  return current
}

function normalizeBasePath(path: string): string {
  const trimmed = `/${path.replace(/^\/+|\/+$/g, '')}/`
  return trimmed === '//' ? '/' : trimmed
}

/** Product name shown in the top bar and the browser tab. */
export const appName = () => current.appName
