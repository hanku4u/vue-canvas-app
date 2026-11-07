/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" serves /api from the in-browser MSW mock instead of the FastAPI backend. */
  readonly VITE_API_MOCK?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
