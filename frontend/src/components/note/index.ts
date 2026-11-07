import { StickyNote } from '@lucide/vue'
import type { ComponentDefinition } from '@/registry/types'
import NoteView from './NoteView.vue'
import { noteConfigSchema, type NoteConfig } from './schema'

export const noteDefinition: ComponentDefinition<NoteConfig> = {
  type: 'note',
  label: 'Note',
  description: 'Markdown notes for context, conclusions and to-dos.',
  icon: StickyNote,
  defaultSize: { w: 288, h: 192 },
  minSize: { w: 160, h: 96 },
  configSchema: noteConfigSchema,
  configVersion: 1,
  defaultConfig: () => noteConfigSchema.parse({}),
  defaultTitle: () => 'Note',
  view: NoteView,
  // No preview: notes are cheap to render at any zoom (text is hidden when tiny).
}
