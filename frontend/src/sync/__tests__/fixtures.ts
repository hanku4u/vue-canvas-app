import type { CanvasComponent, CanvasGroup } from '@/api/types'
import type { DocState } from '@/sync/ops'

/** A saved component for tests. */
export function makeComponent(
  id: string,
  overrides: Partial<CanvasComponent> = {},
): CanvasComponent {
  return {
    id,
    type: 'note',
    title: id,
    groupId: null,
    x: 0,
    y: 0,
    w: 320,
    h: 208,
    zIndex: 0,
    config: { markdown: '', color: 'yellow', fontSize: 'md' },
    configVersion: 1,
    version: 1,
    access: { canEdit: true, viewRestricted: false, editRestricted: false },
    updatedBy: 'j.doe',
    updatedAt: '2026-11-07T00:00:00Z',
    ...overrides,
  }
}

/** A saved group for tests. */
export function makeGroup(id: string, overrides: Partial<CanvasGroup> = {}): CanvasGroup {
  return {
    id,
    title: id,
    x: 0,
    y: 0,
    w: 400,
    h: 300,
    zIndex: 0,
    collapsed: false,
    defaultFilters: {},
    version: 1,
    ...overrides,
  }
}

/** A document from components (and optionally groups). */
export function docOf(
  components: Record<string, CanvasComponent>,
  groups: Record<string, CanvasGroup> = {},
): DocState {
  return { components, groups }
}
