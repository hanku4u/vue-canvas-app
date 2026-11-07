import { HttpResponse } from 'msw'

let counter = 0

export function requestId(): string {
  counter += 1
  return `mock-${Date.now().toString(36)}-${counter}`
}

/** JSON success response with the headers the real backend sends. */
export function ok<T extends object>(body: T, status = 200) {
  return HttpResponse.json(body, { status, headers: { 'x-request-id': requestId() } })
}

/** Error response in the docs/api.md#errors envelope. */
export function apiError(status: number, code: string, message: string, details?: unknown) {
  const id = requestId()
  return HttpResponse.json(
    { error: { code, message, requestId: id, details } },
    { status, headers: { 'x-request-id': id } },
  )
}
