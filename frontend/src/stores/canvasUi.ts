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

  function reset(): void {
    selectedIds.value = []
    activeId.value = null
  }

  return { selectedIds, activeId, setSelection, activate, reset }
})
