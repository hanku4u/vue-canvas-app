import { http } from 'msw'
import type { Me } from '@/api/types'
import { isAdmin } from '../db'
import { apiError, ok } from '../http'
import { identify } from '../identity'

export const meHandlers = [
  http.get('/api/me', ({ request }) => {
    const user = identify(request)
    if (!user) return apiError(401, 'UNAUTHENTICATED', 'Missing x-knox-id')
    const body: Me = {
      knoxId: user.knoxId,
      displayName: user.displayName,
      isAdmin: isAdmin(user.knoxId),
    }
    return ok(body)
  }),
]
