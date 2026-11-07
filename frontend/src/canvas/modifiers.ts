import { onBeforeUnmount, onMounted, ref } from 'vue'

/** True while Alt is held: disables grid snapping during drag and resize. */
export const altPressed = ref(false)

/** Track modifier keys for the lifetime of the calling component. */
export function useModifierKeys(): void {
  const update = (event: KeyboardEvent) => {
    altPressed.value = event.altKey
  }
  const reset = () => {
    altPressed.value = false
  }
  onMounted(() => {
    window.addEventListener('keydown', update)
    window.addEventListener('keyup', update)
    window.addEventListener('blur', reset)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', update)
    window.removeEventListener('keyup', update)
    window.removeEventListener('blur', reset)
    reset()
  })
}
