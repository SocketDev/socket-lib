/**
 * @file Source-side coverage tests for src/ansi/*.ts. Mirrors the dist-bundled
 *   smoke tests in test/unit/ansi.test.mts, but imports the source modules
 *   directly so v8 attributes coverage to the source files. The dist-side test
 *   stays canonical for bundler interop; this file ensures the src/ files
 *   themselves show up in coverage reports.
 */

import { describe, expect, it } from 'vitest'

import {
  ANSI_BOLD,
  ANSI_DIM,
  ANSI_ITALIC,
  ANSI_RESET,
  ANSI_STRIKETHROUGH,
  ANSI_UNDERLINE,
} from '../../../src/ansi/constants'
import { ansiRegex, stripAnsi } from '../../../src/ansi/strip'

describe.sequential('ansi/constants (src)', () => {
  it('exports the canonical ANSI escape sequences', () => {
    expect(ANSI_RESET).toBe('\x1b[0m')
    expect(ANSI_BOLD).toBe('\x1b[1m')
    expect(ANSI_DIM).toBe('\x1b[2m')
    expect(ANSI_ITALIC).toBe('\x1b[3m')
    expect(ANSI_UNDERLINE).toBe('\x1b[4m')
    expect(ANSI_STRIKETHROUGH).toBe('\x1b[9m')
  })
})

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
})
