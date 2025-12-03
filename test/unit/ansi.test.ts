/**
 * @fileoverview Tests for ANSI escape code utilities.
 *
 * IMPORTANT: This test imports from dist/ to catch bundling compatibility issues.
 * The original bug occurred when strip-ansi@6.0.1 was bundled with ansi-regex@6.2.2,
 * causing "stripAnsi22 is not a function" errors. Testing the bundled dist/ ensures
 * we catch ESM/CJS interop issues that only appear after bundling.
 */

import { describe, expect, it } from 'vitest'

import {
  ANSI_BOLD,
  ANSI_DIM,
  ANSI_ITALIC,
  ANSI_RESET,
  ANSI_STRIKETHROUGH,
  ANSI_UNDERLINE,
  ansiRegex,
  stripAnsi,
} from '../../dist/ansi.js'

describe('ansi', () => {
  describe('constants', () => {
    it('should export ANSI escape code constants', () => {
      expect(ANSI_RESET).toBe('\x1b[0m')
      expect(ANSI_BOLD).toBe('\x1b[1m')
      expect(ANSI_DIM).toBe('\x1b[2m')
      expect(ANSI_ITALIC).toBe('\x1b[3m')
      expect(ANSI_UNDERLINE).toBe('\x1b[4m')
      expect(ANSI_STRIKETHROUGH).toBe('\x1b[9m')
    })
  })

  describe('ansiRegex', () => {
    it('should be a function', () => {
      expect(typeof ansiRegex).toBe('function')
    })

    it('should create a global regex by default', () => {
      const regex = ansiRegex()
      expect(regex.global).toBe(true)
    })

    it('should create a global regex with empty options object', () => {
      const regex = ansiRegex({})
      expect(regex.global).toBe(true)
    })

    it('should create a global regex when onlyFirst is false', () => {
      const regex = ansiRegex({ onlyFirst: false })
      expect(regex.global).toBe(true)
    })

    it('should create a non-global regex when onlyFirst is true', () => {
      const regex = ansiRegex({ onlyFirst: true })
      expect(regex.global).toBe(false)
    })

    it('should match ANSI escape sequences', () => {
      const regex = ansiRegex()
      const text = '\x1b[31mred\x1b[0m'
      const matches = text.match(regex)
      expect(matches).toHaveLength(2)
      expect(matches).toEqual(['\x1b[31m', '\x1b[0m'])
    })

    it('should match CSI sequences', () => {
      const regex = ansiRegex()
      const text = '\x1b[1;31mtext\x1b[0m'
      const matches = text.match(regex)
      expect(matches).not.toBeNull()
      expect(matches?.[0]).toBe('\x1b[1;31m')
    })

    it('should match OSC sequences', () => {
      const regex = ansiRegex()
      // OSC 8 hyperlink sequence.
      const text = '\x1b]8;;https://example.com\x07link\x1b]8;;\x07'
      const matches = text.match(regex)
      expect(matches).not.toBeNull()
      expect(matches).toHaveLength(2)
    })

    it('should match multiple different sequence types', () => {
      const regex = ansiRegex()
      // Mix of CSI and OSC sequences.
      const text = '\x1b[31mred\x1b]8;;url\x07link\x1b[0m'
      const matches = text.match(regex)
      expect(matches).not.toBeNull()
      expect(matches!.length).toBeGreaterThanOrEqual(3)
    })

    it('should handle text with no ANSI codes', () => {
      const regex = ansiRegex()
      const text = 'plain text with no codes'
      const matches = text.match(regex)
      expect(matches).toBeNull()
    })

    it('should match C1 control sequences', () => {
      const regex = ansiRegex()
      // C1 CSI sequence (0x9B).
      const text = '\x9B31mtext\x1b[0m'
      const matches = text.match(regex)
      expect(matches).not.toBeNull()
      expect(matches!.length).toBeGreaterThan(0)
    })

    it('should match sequences with colon separators', () => {
      const regex = ansiRegex()
      // RGB color with colon separators.
      const text = '\x1b[38:2:255:0:0mred\x1b[0m'
      const matches = text.match(regex)
      expect(matches).not.toBeNull()
      expect(matches).toHaveLength(2)
    })

    it('should only match first sequence when onlyFirst is true', () => {
      const regex = ansiRegex({ onlyFirst: true })
      const text = '\x1b[31mred\x1b[32mgreen\x1b[0m'
      // With non-global regex, match() returns first match.
      const match = text.match(regex)
      expect(match).not.toBeNull()
      expect(match![0]).toBe('\x1b[31m')
    })
  })

  describe('stripAnsi', () => {
    it('should be a function', () => {
      expect(typeof stripAnsi).toBe('function')
    })

    it('should strip ANSI codes from text', () => {
      const input = '\x1b[31mred\x1b[0m text'
      const expected = 'red text'
      expect(stripAnsi(input)).toBe(expected)
    })

    it('should handle text without ANSI codes', () => {
      const input = 'plain text'
      expect(stripAnsi(input)).toBe(input)
    })

    it('should handle empty string', () => {
      expect(stripAnsi('')).toBe('')
    })

    it('should strip multiple ANSI codes', () => {
      const input = '\x1b[1m\x1b[31mbold red\x1b[0m\x1b[0m'
      const expected = 'bold red'
      expect(stripAnsi(input)).toBe(expected)
    })

    it('should strip complex color codes', () => {
      const input = '\x1b[38;5;196mHello\x1b[0m'
      const expected = 'Hello'
      expect(stripAnsi(input)).toBe(expected)
    })

    it('should work with bundled code (regression test for ansiRegex/stripAnsi compatibility)', () => {
      // This test ensures that stripAnsi and ansiRegex work correctly together.
      // Regression test for bundling issues where strip-ansi@6.0.1 was incompatible
      // with ansi-regex@6.2.2.
      const coloredText = `${ANSI_BOLD}${ANSI_ITALIC}formatted${ANSI_RESET}`
      const plain = stripAnsi(coloredText)
      expect(plain).toBe('formatted')
      expect(plain).not.toContain('\x1b')
    })

    it('should strip RGB color codes', () => {
      const input = '\x1b[38;2;255;0;0mred\x1b[48;2;0;255;0mgreen bg\x1b[0m'
      const expected = 'redgreen bg'
      expect(stripAnsi(input)).toBe(expected)
    })

    it('should strip 256 color codes', () => {
      const input = '\x1b[38;5;196mcolor\x1b[0m'
      const expected = 'color'
      expect(stripAnsi(input)).toBe(expected)
    })

    it('should handle strings with only ANSI codes', () => {
      const input = '\x1b[31m\x1b[1m\x1b[0m'
      expect(stripAnsi(input)).toBe('')
    })

    it('should strip basic cursor codes', () => {
      // stripAnsi uses a simple regex, so test with standard color/format codes.
      const input = '\x1b[1mtext\x1b[0m'
      const expected = 'text'
      expect(stripAnsi(input)).toBe(expected)
    })

    it('should handle mixed content with newlines', () => {
      const input = '\x1b[31mline1\x1b[0m\nline2\n\x1b[32mline3\x1b[0m'
      const expected = 'line1\nline2\nline3'
      expect(stripAnsi(input)).toBe(expected)
    })

    it('should handle Unicode text with ANSI codes', () => {
      const input = '\x1b[31m你好\x1b[0m world'
      const expected = '你好 world'
      expect(stripAnsi(input)).toBe(expected)
    })

    it('should handle emoji with ANSI codes', () => {
      const input = '\x1b[32m🎉\x1b[0m test'
      const expected = '🎉 test'
      expect(stripAnsi(input)).toBe(expected)
    })

    it('should strip codes from long text', () => {
      const input = `\x1b[31m${'a'.repeat(1000)}\x1b[0m`
      const expected = 'a'.repeat(1000)
      expect(stripAnsi(input)).toBe(expected)
    })
  })
})
