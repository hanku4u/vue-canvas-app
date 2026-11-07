import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { api, ApiError } from '@/api/client'
import { setDevKnoxId } from '@/api/devIdentity'
import type { Me } from '@/api/types'
import { handlers } from '@/mocks/handlers'
import { resetDb } from '@/mocks/db'

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  resetDb()
  localStorage.clear()
})
afterAll(() => server.close())

describe('api client against the MSW mock', () => {
  it('returns the default dev user as an admin', async () => {
    const me = await api.get<Me>('/me')
    expect(me).toEqual({ knoxId: 'j.doe', displayName: 'Jane Doe', isAdmin: true })
  })

  it('sends the dev identity header', async () => {
    setDevKnoxId('k.lee')
    const me = await api.get<Me>('/me')
    expect(me.knoxId).toBe('k.lee')
    expect(me.isAdmin).toBe(false)
  })

  it('maps the error envelope to ApiError', async () => {
    const error = await api
      .get<Me>('/me', { headers: { 'x-knox-id': '' } })
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 401, code: 'UNAUTHENTICATED', isClientError: true })
    expect((error as ApiError).requestId).toMatch(/^mock-/)
  })

  it('handles 204 and non-envelope errors', async () => {
    server.use(
      http.delete('/api/thing', () => new HttpResponse(null, { status: 204 })),
      http.get('/api/broken', () => new HttpResponse('upstream exploded', { status: 502 })),
    )
    await expect(api.delete('/thing')).resolves.toBeUndefined()
    await expect(api.get('/broken')).rejects.toMatchObject({ status: 502, code: 'HTTP_502' })
  })

  it('reports network failures as NETWORK_ERROR', async () => {
    server.use(http.get('/api/down', () => HttpResponse.error()))
    await expect(api.get('/down')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' })
  })
})
