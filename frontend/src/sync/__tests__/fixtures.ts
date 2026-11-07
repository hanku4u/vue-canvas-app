import type { CanvasComponent } from '@/api/types'

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
