import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '@/components/note/markdown'

function dom(html: string): HTMLElement {
  const div = document.createElement('div')
  div.innerHTML = html
  return div
}

describe('renderMarkdown', () => {
  it('renders common Markdown', () => {
    const html = dom(
      renderMarkdown('# Title\n\n**bold** and `code`\n\n| a | b |\n|---|---|\n| 1 | 2 |'),
    )
    expect(html.querySelector('h1')?.textContent).toBe('Title')
    expect(html.querySelector('strong')?.textContent).toBe('bold')
    expect(html.querySelector('code')?.textContent).toBe('code')
    expect(html.querySelectorAll('td')).toHaveLength(2)
  })

  it('renders task lists as disabled checkboxes', () => {
    const html = dom(renderMarkdown('- [x] done\n- [ ] todo\n- plain'))
    const boxes = html.querySelectorAll<HTMLInputElement>('input[type=checkbox]')
    expect(boxes).toHaveLength(2)
    expect([...boxes].map((b) => [b.checked, b.disabled])).toEqual([
      [true, true],
      [false, true],
    ])
    expect(html.querySelectorAll('li.task-list-item')).toHaveLength(2)
    expect(html.textContent).toContain('done')
  })

  it('never produces raw HTML or scripts', () => {
    const html = renderMarkdown('<script>alert(1)</script><img src=x onerror=alert(1)> <b>hi</b>')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<b>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('drops javascript: links and opens real links in a new tab', () => {
    const links = dom(renderMarkdown('[bad](javascript:alert(1)) [good](https://example.com)'))
    const anchors = [...links.querySelectorAll('a')]
    expect(anchors).toHaveLength(1)
    expect(anchors[0]?.getAttribute('href')).toBe('https://example.com')
    expect(anchors[0]?.getAttribute('target')).toBe('_blank')
    expect(anchors[0]?.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('linkifies bare URLs', () => {
    expect(dom(renderMarkdown('see https://example.com/x')).querySelector('a')).not.toBeNull()
  })
})
