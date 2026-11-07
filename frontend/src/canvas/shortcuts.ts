import { onBeforeUnmount, onMounted } from 'vue'

/**
 * Keyboard shortcut registry.
 *
 * Combos are written like `mod+a`, `shift+1`, `mod+shift+z`, `arrowup`, `[`, `+`.
 * `mod` is Ctrl on Windows/Linux and ⌘ on macOS (either is accepted).
 * Letters and digits match the physical key (event.code), so `shift+1` works on any layout.
 * Punctuation matches the produced character (event.key) and ignores Shift, so `+` matches
 * both the numpad plus and Shift+= on a US keyboard.
 */

export interface Shortcut {
  combo: string | string[]
  description: string
  handler: (event: KeyboardEvent) => void
  /** Run even while typing in an input (default false). */
  allowInInputs?: boolean
  /**
   * Run even when focus is inside a component that handles its own keys, e.g. a table
   * grid (marked with `data-own-keyboard`). Default false.
   */
  allowInComponents?: boolean
}

interface ParsedCombo {
  mod: boolean
  shift: boolean
  alt: boolean
  code?: string
  key?: string
  ignoreShift: boolean
}

const NAMED_KEYS = new Set([
  'arrowup',
  'arrowdown',
  'arrowleft',
  'arrowright',
  'delete',
  'backspace',
  'escape',
  'enter',
  'tab',
  'space',
  'f2',
])

export function parseCombo(combo: string): ParsedCombo {
  // Split on '+' but keep a trailing literal '+' (e.g. "mod++" or "+").
  const parts = combo === '+' ? ['+'] : combo.toLowerCase().split(/\+(?!$)/)
  const key = parts[parts.length - 1] ?? ''
  const mods = new Set(parts.slice(0, -1))
  const parsed: ParsedCombo = {
    mod: mods.has('mod'),
    shift: mods.has('shift'),
    alt: mods.has('alt'),
    ignoreShift: false,
  }
  if (/^[a-z]$/.test(key)) parsed.code = `Key${key.toUpperCase()}`
  else if (/^[0-9]$/.test(key)) parsed.code = `Digit${key}`
  else if (key === 'space') parsed.code = 'Space'
  else if (NAMED_KEYS.has(key)) parsed.key = key
  else {
    parsed.key = key
    parsed.ignoreShift = true
  }
  return parsed
}

export function matchesCombo(event: KeyboardEvent, combo: string): boolean {
  const parsed = parseCombo(combo)
  const mod = event.ctrlKey || event.metaKey
  if (mod !== parsed.mod || event.altKey !== parsed.alt) return false
  if (!parsed.ignoreShift && event.shiftKey !== parsed.shift) return false
  if (parsed.code) return event.code === parsed.code
  return event.key.toLowerCase() === parsed.key
}

/** True when the event comes from somewhere the user is typing, or from inside a dialog. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) {
    return true
  }
  return !!target.closest('[role="dialog"], .n-modal')
}

/** Handle a keydown against a list of shortcuts. Returns the shortcut that ran, if any. */
export function dispatchShortcut(event: KeyboardEvent, shortcuts: Shortcut[]): Shortcut | null {
  if (event.defaultPrevented || event.isComposing) return null
  const typing = isTypingTarget(event.target)
  const ownKeyboard =
    event.target instanceof Element && !!event.target.closest('[data-own-keyboard]')
  for (const shortcut of shortcuts) {
    if (typing && !shortcut.allowInInputs) continue
    if (ownKeyboard && !shortcut.allowInComponents) continue
    const combos = Array.isArray(shortcut.combo) ? shortcut.combo : [shortcut.combo]
    if (combos.some((combo) => matchesCombo(event, combo))) {
      event.preventDefault()
      shortcut.handler(event)
      return shortcut
    }
  }
  return null
}

/** Register shortcuts on window for the lifetime of the calling component. */
export function useShortcuts(shortcuts: () => Shortcut[]): void {
  const onKeydown = (event: KeyboardEvent) => dispatchShortcut(event, shortcuts())
  onMounted(() => window.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
}
