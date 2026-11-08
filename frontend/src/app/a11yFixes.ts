/**
 * Accessibility patch for a Naive UI issue: card headers (NCard, and NModal's "card"
 * preset used by every dialog) render `role="heading"` without `aria-level`, which is
 * invalid ARIA (axe: aria-required-attr). Fill in a level wherever one appears.
 * Remove once Naive UI sets it itself.
 */
export function installA11yFixes(root: HTMLElement = document.body): void {
  const fix = (scope: ParentNode) => {
    for (const el of scope.querySelectorAll('[role="heading"]:not([aria-level])')) {
      el.setAttribute('aria-level', '2')
    }
  }
  fix(root)
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof HTMLElement) {
          if (node.getAttribute('role') === 'heading' && !node.hasAttribute('aria-level')) {
            node.setAttribute('aria-level', '2')
          }
          fix(node)
        }
      }
    }
  }).observe(root, { childList: true, subtree: true })
}
