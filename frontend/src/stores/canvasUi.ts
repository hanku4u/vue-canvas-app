import { ref } from 'vue'
import { defineStore } from 'pinia'

/**
 * Per-session UI state of the open canvas (not persisted, not part of the document).
 * Selection is owned by Vue Flow and mirrored here so panels outside the canvas
 * (inspector) can read it.
 */
export const useCanvasUiStore = defineStore('canvasUi', () => {
  const selectedIds = ref<string[]>([])
  /**
   * The active component receives wheel and drag events inside its body instead of the
   * canvas (docs/canvas-ux.md, "Wheel and drag inside components").
   */
  const activeId = ref<string | null>(null)

  function setSelection(ids: string[]): void {
    selectedIds.value = ids
    if (activeId.value && !ids.includes(activeId.value)) activeId.value = null
  }

  function activate(id: string | null): void {
    activeId.value = id
  }

  /**
   * Rows selected inside data components (e.g. table rows), keyed by component id.
   * Publishing them into filters is wired in F10.
   */
  /** Component whose "Restrict access…" dialog is open. */
  const accessDialogFor = ref<string | null>(null)

  /** Component shown full screen (FullscreenView), if any. */
  const fullscreenId = ref<string | null>(null)

  /** Component to highlight (e.g. the source of a hovered filter chip). */
  const highlightId = ref<string | null>(null)

  const rowSelections = ref<Record<string, Record<string, unknown>[]>>({})

  function setRowSelection(componentId: string, rows: Record<string, unknown>[]): void {
    if (rows.length) rowSelections.value[componentId] = rows
    else delete rowSelections.value[componentId]
  }

  function reset(): void {
    selectedIds.value = []
    activeId.value = null
    rowSelections.value = {}
    fullscreenId.value = null
  }

  return {
    selectedIds,
    activeId,
    highlightId,
    fullscreenId,
    accessDialogFor,
    rowSelections,
    setSelection,
    activate,
    setRowSelection,
    reset,
  }
})
