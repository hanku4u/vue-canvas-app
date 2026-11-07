import { describe, expect, it } from 'vitest'
import { formatRelativeTime, pluralize } from '@/ui/format'

const NOW = Date.parse('2026-11-07T12:00:00Z')
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString()

describe('formatRelativeTime', () => {
  it.each([
    [10, 'just now'],
    [5 * 60, '5 minutes ago'],
    [2 * 3600, '2 hours ago'],
    [24 * 3600, 'yesterday'],
    [3 * 24 * 3600, '3 days ago'],
    [14 * 24 * 3600, '2 weeks ago'],
    [400 * 24 * 3600, 'last year'],
  ])('%i seconds ago → %s', (seconds, expected) => {
    expect(formatRelativeTime(ago(seconds), NOW)).toBe(expected)
  })

  it('returns an empty string for invalid input', () => {
    expect(formatRelativeTime('not a date', NOW)).toBe('')
  })
})

describe('pluralize', () => {
  it('handles singular and plural', () => {
    expect(pluralize(1, 'component')).toBe('1 component')
    expect(pluralize(0, 'component')).toBe('0 components')
  })
})
