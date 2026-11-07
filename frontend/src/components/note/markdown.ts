import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'

/**
 * Markdown → sanitized HTML for notes. Raw HTML in the source is not parsed (html: false)
 * and the output is sanitized again with DOMPurify, so notes can never inject markup or
 * scripts. Supports headings, lists, task lists ("- [ ]" / "- [x]"), links, code and tables.
 */
const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

// Task lists: a list item whose text starts with "[ ] " or "[x] " gets a disabled checkbox.
md.core.ruler.after('inline', 'task-lists', (state) => {
  const tokens = state.tokens
  for (let i = 2; i < tokens.length; i += 1) {
    const inline = tokens[i]
    if (inline?.type !== 'inline' || tokens[i - 2]?.type !== 'list_item_open') continue
    const first = inline.children?.[0]
    const match = first?.type === 'text' ? /^\[([ xX])\]\s+/.exec(first.content) : null
    if (!first || !match) continue
    first.content = first.content.slice(match[0].length)
    const checkbox = new state.Token('html_inline', '', 0)
    checkbox.content = `<input type="checkbox" disabled${match[1] === ' ' ? '' : ' checked'}> `
    inline.children?.unshift(checkbox)
    tokens[i - 2]?.attrJoin('class', 'task-list-item')
  }
})

let hooksInstalled = false

function installHooks(): void {
  if (hooksInstalled) return
  hooksInstalled = true
  // Links open in a new tab and never leak the app as referrer.
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    }
  })
}

export function renderMarkdown(source: string): string {
  installHooks()
  return DOMPurify.sanitize(md.render(source), {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target'],
  })
}
