<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { ComponentViewProps } from '@/registry/types'
import { renderMarkdown } from './markdown'
import type { NoteConfig } from './schema'

const props = defineProps<ComponentViewProps<NoteConfig>>()
const emit = defineEmits<{ 'update-config': [patch: Partial<NoteConfig>] }>()

const editing = ref(false)
const draft = ref('')
const textarea = ref<HTMLTextAreaElement | null>(null)

const html = computed(() => renderMarkdown(props.config.markdown))

async function startEditing(): Promise<void> {
  if (!props.editable || editing.value) return
  draft.value = props.config.markdown
  editing.value = true
  await nextTick()
  textarea.value?.focus()
}

function finishEditing(): void {
  if (!editing.value) return
  editing.value = false
  if (draft.value !== props.config.markdown) emit('update-config', { markdown: draft.value })
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey))) {
    event.preventDefault()
    finishEditing()
  }
}
</script>

<template>
  <div
    class="note"
    :class="[`note--${config.color}`, `note--${config.fontSize}`, { 'is-editing': editing }]"
    data-testid="note"
    @dblclick="startEditing"
  >
    <textarea
      v-if="editing"
      ref="textarea"
      v-model="draft"
      class="note__editor nodrag nowheel"
      placeholder="Write Markdown… (Ctrl/⌘ + Enter to finish)"
      aria-label="Note text"
      data-testid="note-editor"
      @keydown="onKeydown"
      @blur="finishEditing"
    />
    <!-- eslint-disable-next-line vue/no-v-html -- sanitized by DOMPurify in renderMarkdown -->
    <div
      v-else-if="config.markdown"
      class="note__content"
      :class="{ nowheel: active }"
      v-html="html"
    />
    <p v-else class="note__empty">
      {{ editable ? 'Double-click to write a note' : 'Empty note' }}
    </p>
  </div>
</template>

<style scoped>
.note {
  height: 100%;
  overflow: hidden;
  background: var(--note-bg);
  color: var(--app-text);
  --note-bg: var(--note-default);
}

.note--yellow {
  --note-bg: var(--note-yellow);
}
.note--blue {
  --note-bg: var(--note-blue);
}
.note--green {
  --note-bg: var(--note-green);
}
.note--red {
  --note-bg: var(--note-red);
}

.note--sm {
  font-size: 12px;
}
.note--md {
  font-size: 14px;
}
.note--lg {
  font-size: 18px;
}

.note__content {
  height: 100%;
  overflow: auto;
  padding: 10px 14px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.note__content :deep(> :first-child) {
  margin-top: 0;
}

.note__content :deep(> :last-child) {
  margin-bottom: 0;
}

.note__content :deep(h1),
.note__content :deep(h2),
.note__content :deep(h3) {
  margin: 0.6em 0 0.3em;
  line-height: 1.25;
}

.note__content :deep(h1) {
  font-size: 1.5em;
}
.note__content :deep(h2) {
  font-size: 1.25em;
}
.note__content :deep(h3) {
  font-size: 1.1em;
}

.note__content :deep(p),
.note__content :deep(ul),
.note__content :deep(ol),
.note__content :deep(table) {
  margin: 0.4em 0;
}

.note__content :deep(ul),
.note__content :deep(ol) {
  padding-left: 1.4em;
}

.note__content :deep(.task-list-item) {
  list-style: none;
  margin-left: -1.2em;
}

.note__content :deep(code) {
  padding: 0 4px;
  border-radius: 4px;
  background: rgb(0 0 0 / 7%);
  font-size: 0.9em;
}

.note__content :deep(table) {
  border-collapse: collapse;
}

.note__content :deep(th),
.note__content :deep(td) {
  border: 1px solid var(--app-border);
  padding: 2px 6px;
}

.note__content :deep(a) {
  color: var(--app-primary);
}

.note__editor {
  width: 100%;
  height: 100%;
  padding: 10px 14px;
  border: 0;
  outline: none;
  resize: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.9em;
  line-height: 1.5;
}

.note__empty {
  margin: 0;
  padding: 10px 14px;
  color: var(--app-text-muted);
  font-style: italic;
}
</style>
