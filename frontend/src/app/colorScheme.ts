import { computed, ref, watch } from 'vue'
import { DARK_MODE_CLASS } from './theme'

export type ColorSchemePreference = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'ui.colorScheme'

function readPreference(): ColorSchemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (value === 'light' || value === 'dark' || value === 'system') return value
  } catch {
    // Storage unavailable: fall back to the system setting.
  }
  return 'system'
}

const media = globalThis.matchMedia?.('(prefers-color-scheme: dark)')
const systemDark = ref(!!media?.matches)

export const colorSchemePreference = ref<ColorSchemePreference>(readPreference())

export const isDark = computed(
  () =>
    colorSchemePreference.value === 'dark' ||
    (colorSchemePreference.value === 'system' && systemDark.value),
)

/** Persist the preference, follow system changes, and mirror dark mode onto <html>. */
export function initColorScheme(): void {
  media?.addEventListener('change', (event) => {
    systemDark.value = event.matches
  })
  watch(colorSchemePreference, (value) => {
    try {
      localStorage.setItem(STORAGE_KEY, value)
    } catch {
      // Not persisted; still applied for this session.
    }
  })
  watch(isDark, (dark) => document.documentElement.classList.toggle(DARK_MODE_CLASS, dark), {
    immediate: true,
  })
}
