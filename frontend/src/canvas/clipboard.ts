import type { CanvasComponent } from '@/api/types'
import type { NewComponentInput } from '@/stores/canvasDoc'
import { snap } from './geometry'

/**
 * Copy/paste of components. The payload goes to localStorage, so paste works across
 * canvases and tabs in the same browser without clipboard permissions; it is also written
 * to the system clipboard as JSON (best effort) for debugging and sharing.
 */

const STORAGE_KEY = 'canvas.clipboard'
const KIND = 'fab-canvas/components'

export interface ClipboardItem {
  type: string
  title: string
  x: number
  y: number
  w: number
  h: number
  config: Record<string, unknown>
  configVersion: number
}

export interface ClipboardPayload {
  kind: typeof KIND
  version: 1
  sourceCanvasId: string
  copiedAt: string
  items: ClipboardItem[]
}

export function toClipboard(canvasId: string, components: CanvasComponent[]): ClipboardPayload {
  return {
    kind: KIND,
    version: 1,
    sourceCanvasId: canvasId,
    copiedAt: new Date().toISOString(),
    items: components.map((c) => ({
      type: c.type,
      title: c.title,
      x: c.x,
      y: c.y,
      w: c.w,
      h: c.h,
      config: JSON.parse(JSON.stringify(c.config)) as Record<string, unknown>,
      configVersion: c.configVersion,
    })),
  }
}

export function writeClipboard(payload: ClipboardPayload): void {
  const text = JSON.stringify(payload)
  try {
    localStorage.setItem(STORAGE_KEY, text)
  } catch {
    // Storage unavailable: the system clipboard below is the only copy.
  }
  void navigator.clipboard?.writeText(text).catch(() => undefined)
}

export function readClipboard(): ClipboardPayload | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const value = raw ? (JSON.parse(raw) as Partial<ClipboardPayload>) : null
    return value?.kind === KIND && Array.isArray(value.items) ? (value as ClipboardPayload) : null
  } catch {
    return null
  }
}

/**
 * Components to create for a paste. With a target point, the copied group's top-left
 * corner lands there (snapped); otherwise everything is offset from its original position.
 */
export function pasteInputs(
  payload: ClipboardPayload,
  at: { x: number; y: number } | null,
  offset = 32,
): NewComponentInput[] {
  if (!payload.items.length) return []
  const minX = Math.min(...payload.items.map((i) => i.x))
  const minY = Math.min(...payload.items.map((i) => i.y))
  const dx = at ? snap(at.x) - minX : offset
  const dy = at ? snap(at.y) - minY : offset
  return payload.items.map((item) => ({
    type: item.type,
    title: item.title,
    x: item.x + dx,
    y: item.y + dy,
    w: item.w,
    h: item.h,
    config: item.config,
    configVersion: item.configVersion,
  }))
}
