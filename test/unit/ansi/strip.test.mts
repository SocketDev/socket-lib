/**
 * @file Unit tests for src/ansi/strip — ansiRegex and stripAnsi.
 */

import { describe, expect, it } from 'vitest'

import { ansiRegex, stripAnsi } from '../../../src/ansi/strip'

describe.sequential('ansi/strip (src) — ansiRegex', () => {
  it('returns a fresh RegExp each call (global flag avoids shared lastIndex)', () => {
    const a = ansiRegex()
    const b = ansiRegex()
    expect(a).not.toBe(b)
    expect(a.flags).toContain('g')
  })

  it('matches color escape sequences', () => {
    expect('\x1b[31mred\x1b[0m'.match(ansiRegex())).not.toBeNull()
  })

  it('matches OSC hyperlink sequences', () => {
    const link = '\x1b]8;;https://example.com\x07click\x1b]8;;\x07'
    const matches = link.match(ansiRegex())
    expect(matches).not.toBeNull()
    expect(matches?.length).toBeGreaterThanOrEqual(2)
  })

  it('returns null for plain text with no ANSI sequences', () => {
    expect('plain text'.match(ansiRegex())).toBeNull()
  })
})

describe.sequential('ansi/strip (src) — stripAnsi', () => {
  it('strips a simple color sequence', () => {
    expect(stripAnsi('\x1b[31mhello\x1b[0m')).toBe('hello')
  })

  it('strips multiple sequences in one string', () => {
    expect(stripAnsi('\x1b[1m\x1b[31mbold-red\x1b[0m suffix')).toBe(
      'bold-red suffix',
    )
  })

  it('passes plain text through unchanged', () => {
    expect(stripAnsi('no escapes here')).toBe('no escapes here')
  })

  it('returns empty string for empty input', () => {
    expect(stripAnsi('')).toBe('')
  })

  it('removes ANSI escape codes', () => {
    expect(stripAnsi('\x1b[31mred\x1b[0m')).toBe('red')
    expect(stripAnsi('\x1b[1mbold\x1b[22m text')).toBe('bold text')
  })

  it('returns plain text unchanged', () => {
    expect(stripAnsi('plain text')).toBe('plain text')
  })

  it('handles empty strings', () => {
    expect(stripAnsi('')).toBe('')
  })
})

describe('ansi/strip (src) — ansiRegex (additional)', () => {
  it('matches ANSI escape codes', () => {
    expect('\x1b[31mred\x1b[0m'.match(ansiRegex())).toBeTruthy()
    expect('\x1b[1mbold\x1b[0m'.match(ansiRegex())).toBeTruthy()
  })

  it('does not match plain text', () => {
    expect('plain text'.match(ansiRegex())).toBeNull()
  })
})
