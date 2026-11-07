import type { ApiErrorBody } from './types'
import { getDevKnoxId } from './devIdentity'

export const API_BASE = '/api'

/** Error returned by the API, carrying the error envelope from docs/api.md#errors. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly requestId?: string
  readonly details?: unknown

  constructor(
    status: number,
    code: string,
    message: string,
    requestId?: string,
    details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
    this.details = details
  }

  /** 4xx errors are the caller's fault and should not be retried. */
  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface RequestOptions {
  signal?: AbortSignal
  headers?: Record<string, string>
}

function apiUrl(path: string): string {
  // Absolute URL so the client also works under Node (unit tests), where fetch needs one.
  const origin = globalThis.location?.origin ?? 'http://localhost'
  return new URL(`${API_BASE}${path}`, origin).toString()
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function isErrorBody(value: unknown): value is ApiErrorBody {
  return typeof value === 'object' && value !== null && 'error' in value
}

export async function apiFetch<T>(
  method: Method,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json', ...options.headers }
  if (body !== undefined) headers['content-type'] = 'application/json'
  const devKnoxId = getDevKnoxId()
  if (devKnoxId && !('x-knox-id' in headers)) headers['x-knox-id'] = devKnoxId

  let response: Response
  try {
    response = await fetch(apiUrl(path), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: options.signal,
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server')
  }

  const requestId = response.headers.get('x-request-id') ?? undefined
  if (response.status === 204) return undefined as T

  const text = await response.text()
  const json = text ? parseJson(text) : undefined

  if (!response.ok) {
    const err = isErrorBody(json) ? json.error : undefined
    throw new ApiError(
      response.status,
      err?.code ?? `HTTP_${response.status}`,
      err?.message ?? (response.statusText || 'Request failed'),
      err?.requestId ?? requestId,
      err?.details,
    )
  }
  return json as T
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => apiFetch<T>('GET', path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>('POST', path, body, options),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>('PUT', path, body, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>('PATCH', path, body, options),
  delete: <T = void>(path: string, options?: RequestOptions) =>
    apiFetch<T>('DELETE', path, undefined, options),
}
