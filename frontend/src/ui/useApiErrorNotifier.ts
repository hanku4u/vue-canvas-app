import { h } from 'vue'
import { useNotification } from 'naive-ui'
import { ApiError } from '@/api/client'

/** Human-readable text for an error from the API (or anything else that was thrown). */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return String(error)
}

/**
 * Show API errors as notifications with the error code and a copyable request id,
 * as described in docs/canvas-ux.md ("Error" state).
 */
export function useApiErrorNotifier() {
  const notification = useNotification()

  return function notifyError(title: string, error: unknown): void {
    const meta =
      error instanceof ApiError
        ? [error.code, error.requestId && `request ${error.requestId}`].filter(Boolean).join(' · ')
        : undefined
    notification.error({
      title,
      content: describeError(error),
      meta: meta
        ? () => h('code', { style: 'font-size: 12px; user-select: all' }, meta)
        : undefined,
      duration: 8000,
      keepAliveOnHover: true,
    })
  }
}
