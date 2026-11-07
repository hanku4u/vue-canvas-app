import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

export const worker = setupWorker(...handlers)

export async function startMockApi(): Promise<void> {
  await worker.start({
    quiet: true,
    onUnhandledRequest(request, print) {
      // Everything outside /api (assets, the mock data API proxy) passes through silently.
      if (new URL(request.url).pathname.startsWith('/api/')) print.warning()
    },
  })
  console.info('[mock] /api is served by MSW (VITE_API_MOCK=1)')
}
