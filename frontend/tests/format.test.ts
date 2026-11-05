import { describe, expect, it } from 'vitest'
import { formatRupiah, relativeTime } from '../src/lib/format'

describe('formatRupiah', () => {
  it.each<[number, string]>([
    [0, 'Rp 0'],
    [120000, 'Rp 120.000'],
    [1234567, 'Rp 1.234.567'],
  ])('formats %i in integer rupiah', (amount, expected) => {
    expect(formatRupiah(amount).replace(/\s+/g, ' ')).toBe(expected)
  })
})

describe('relativeTime', () => {
  const now = Date.parse('2026-11-05T12:00:00+07:00')
  const before = (seconds: number) => new Date(now - seconds * 1000).toISOString()

  it('handles missing and invalid timestamps', () => {
    expect(relativeTime(null, now)).toBe('No movements')
    expect(relativeTime('invalid', now)).toBe('Unknown time')
  })

  it.each<[number, string]>([
    [0, 'Just now'],
    [59, 'Just now'],
    [60, '1m ago'],
    [3599, '59m ago'],
    [3600, '1h ago'],
    [7200, '2h ago'],
    [86399, '23h ago'],
    [86400, '1d ago'],
    [172800, '2d ago'],
  ])('formats an elapsed time of %i seconds', (seconds, expected) => {
    expect(relativeTime(before(seconds), now)).toBe(expected)
  })

  it('handles future timestamps without negative ago text', () => {
    expect(relativeTime(before(-30), now)).toBe('In a moment')
    expect(relativeTime(before(-7200), now)).toBe('In 2h')
  })

  it('uses timestamps consistently across time zones', () => {
    expect(relativeTime('2026-11-05T04:00:00Z', now)).toBe('1h ago')
    expect(relativeTime('2026-11-05T11:00:00+07:00', now)).toBe('1h ago')
  })
})
