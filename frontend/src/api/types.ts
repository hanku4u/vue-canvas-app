/**
 * API types, hand-written from docs/api.md.
 * Replace with types generated from FastAPI's OpenAPI schema once the backend exists.
 */

export interface Me {
  knoxId: string
  displayName: string
  isAdmin: boolean
}

export interface ApiErrorBody {
  error: {
    code: string
    message: string
    requestId?: string
    details?: unknown
  }
}
