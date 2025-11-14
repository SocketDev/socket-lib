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
  })
})
