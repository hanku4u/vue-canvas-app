import { describe, expect, it, vi } from 'vitest'
import { dispatchShortcut, isTypingTarget, matchesCombo, type Shortcut } from '@/canvas/shortcuts'

function key(init: KeyboardEventInit & { target?: EventTarget }): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  if (init.target) Object.defineProperty(event, 'target', { value: init.target })
  return event
}

describe('matchesCombo', () => {
  it('treats Ctrl and Meta as mod', () => {
    expect(matchesCombo(key({ key: 'a', code: 'KeyA', ctrlKey: true }), 'mod+a')).toBe(true)
    expect(matchesCombo(key({ key: 'a', code: 'KeyA', metaKey: true }), 'mod+a')).toBe(true)
    expect(matchesCombo(key({ key: 'a', code: 'KeyA' }), 'mod+a')).toBe(false)
  })

  it('matches letters and digits by physical key', () => {
    // Shift+1 produces "!" on a US layout; the code is still Digit1.
    expect(matchesCombo(key({ key: '!', code: 'Digit1', shiftKey: true }), 'shift+1')).toBe(true)
    expect(matchesCombo(key({ key: '1', code: 'Digit1' }), 'shift+1')).toBe(false)
  })

  it('requires exact modifiers for named keys', () => {
    expect(matchesCombo(key({ key: 'ArrowUp' }), 'arrowup')).toBe(true)
    expect(matchesCombo(key({ key: 'ArrowUp', shiftKey: true }), 'arrowup')).toBe(false)
    expect(matchesCombo(key({ key: 'ArrowUp', shiftKey: true }), 'shift+arrowup')).toBe(true)
    expect(matchesCombo(key({ key: 'Delete', altKey: true }), 'delete')).toBe(false)
  })

  it('ignores Shift for punctuation', () => {
    expect(matchesCombo(key({ key: '+', shiftKey: true }), '+')).toBe(true)
    expect(matchesCombo(key({ key: '+' }), '+')).toBe(true)
    expect(matchesCombo(key({ key: ']' }), ']')).toBe(true)
    expect(matchesCombo(key({ key: '+', ctrlKey: true }), '+')).toBe(false)
  })

  it('handles mod with a literal plus', () => {
    expect(matchesCombo(key({ key: '+', ctrlKey: true }), 'mod++')).toBe(true)
  })
})

describe('isTypingTarget', () => {
  it('detects inputs, contenteditable and dialogs', () => {
    const input = document.createElement('input')
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    const button = document.createElement('button')
    dialog.appendChild(button)
    expect(isTypingTarget(input)).toBe(true)
    expect(isTypingTarget(editable)).toBe(true)
    expect(isTypingTarget(button)).toBe(true)
    expect(isTypingTarget(document.createElement('div'))).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})

describe('dispatchShortcut', () => {
  const shortcuts = (handler: () => void, allowInInputs = false): Shortcut[] => [
    { combo: ['delete', 'backspace'], description: 'Delete', handler, allowInInputs },
  ]

  it('runs the first matching shortcut and prevents the default action', () => {
    const handler = vi.fn<() => void>()
    const event = key({ key: 'Backspace' })
    expect(dispatchShortcut(event, shortcuts(handler))?.description).toBe('Delete')
    expect(handler).toHaveBeenCalledOnce()
    expect(event.defaultPrevented).toBe(true)
  })

  it('skips shortcuts while typing unless allowed', () => {
    const handler = vi.fn<() => void>()
    const target = document.createElement('textarea')
    expect(dispatchShortcut(key({ key: 'Backspace', target }), shortcuts(handler))).toBeNull()
    expect(handler).not.toHaveBeenCalled()
    dispatchShortcut(key({ key: 'Backspace', target }), shortcuts(handler, true))
    expect(handler).toHaveBeenCalledOnce()
  })

  it('ignores events another handler already handled', () => {
    const handler = vi.fn<() => void>()
    const event = key({ key: 'Delete' })
    event.preventDefault()
    expect(dispatchShortcut(event, shortcuts(handler))).toBeNull()
    expect(handler).not.toHaveBeenCalled()
  })
})
