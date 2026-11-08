import { h, type VNodeChild } from 'vue'
import { NIcon } from 'naive-ui'
import { Check } from '@lucide/vue'

export interface MenuLabelOptions {
  /** Keyboard shortcut shown right-aligned, e.g. "Ctrl/⌘ A". */
  hint?: string
  /** Show a check mark (current choice). */
  checked?: boolean
  danger?: boolean
}

/**
 * Label renderer for Naive UI dropdown options with an optional right-aligned shortcut
 * hint or check mark (the dropdown has no built-in suffix slot for this).
 */
export function menuLabel(text: string, options: MenuLabelOptions = {}): () => VNodeChild {
  return () =>
    h('span', { class: ['menu-label', options.danger && 'menu-label--danger'] }, [
      h('span', { class: 'menu-label__text' }, text),
      options.hint
        ? h('kbd', { class: 'menu-label__hint' }, options.hint)
        : options.checked
          ? h(
              NIcon,
              { class: 'menu-label__check', size: 14, 'aria-hidden': 'true' },
              { default: () => h(Check) },
            )
          : null,
    ])
}
