/**
 * @file Unit tests for spec-compliant RegExp.escape fallback.
 */

import { describe, expect, it } from 'vitest'

import {
  escapeRegExpFallback,
  isSpecHexEscapeCp,
} from '../../../src/regexps/spec'

describe('regexps/spec', () => {
  describe('escapeRegExpFallback — empty + plain', () => {
    it('returns empty string for empty input', () => {
      expect(escapeRegExpFallback('')).toBe('')
    })

    it('passes plain ASCII letters/digits through verbatim when not leading', () => {
      // First char is hex-escaped, the rest pass through.
      expect(escapeRegExpFallback('hello')).toBe('\\x68ello')
    })
  })

  describe('escapeRegExpFallback — leading [0-9A-Za-z] hex-escapes', () => {
    it('hex-escapes a leading digit', () => {
      expect(escapeRegExpFallback('1abc')).toBe('\\x31abc')
    })

    it('hex-escapes a leading uppercase letter', () => {
      expect(escapeRegExpFallback('Abc')).toBe('\\x41bc')
    })

    it('hex-escapes a leading lowercase letter', () => {
      expect(escapeRegExpFallback('zoo')).toBe('\\x7aoo')
    })
  })

  describe('escapeRegExpFallback — SyntaxCharacter + /', () => {
    it('backslash-prefixes each syntax char', () => {
      expect(escapeRegExpFallback('^$\\.*+?()[]{}|/')).toBe(
        '\\^\\$\\\\\\.\\*\\+\\?\\(\\)\\[\\]\\{\\}\\|\\/',
      )
    })
  })

  describe('escapeRegExpFallback — ControlEscape mappings', () => {
    it('emits \\t for tab', () => {
      expect(escapeRegExpFallback('\t')).toBe('\\t')
    })

    it('emits \\n for newline', () => {
      expect(escapeRegExpFallback('\n')).toBe('\\n')
    })

    it('emits \\v for vertical tab', () => {
      expect(escapeRegExpFallback('\v')).toBe('\\v')
    })

    it('emits \\f for form feed', () => {
      expect(escapeRegExpFallback('\f')).toBe('\\f')
    })

    it('emits \\r for carriage return', () => {
      expect(escapeRegExpFallback('\r')).toBe('\\r')
    })
  })

  describe('escapeRegExpFallback — OTHER_PUNCTUATORS', () => {
    it('hex-escapes each punctuator', () => {
      // Pick a non-leading position; leading chars trip the [0-9A-Za-z] path.
      // Use a leading space (which routes through isSpecHexEscapeCp).
      expect(escapeRegExpFallback(' ,')).toBe('\\x20\\x2c')
      expect(escapeRegExpFallback(' -')).toBe('\\x20\\x2d')
      expect(escapeRegExpFallback(' =')).toBe('\\x20\\x3d')
      expect(escapeRegExpFallback(' #')).toBe('\\x20\\x23')
      expect(escapeRegExpFallback(' !')).toBe('\\x20\\x21')
    })
  })

  describe('escapeRegExpFallback — whitespace + line terminators', () => {
    it('hex-escapes NBSP', () => {
      expect(escapeRegExpFallback(' ')).toBe('\\xa0')
    })

    it('uHHHH-escapes ZWNBSP (U+FEFF)', () => {
      expect(escapeRegExpFallback('﻿')).toBe('\\ufeff')
    })

    it('uHHHH-escapes LS (U+2028)', () => {
      expect(escapeRegExpFallback(' ')).toBe('\\u2028')
    })

    it('uHHHH-escapes PS (U+2029)', () => {
      expect(escapeRegExpFallback(' ')).toBe('\\u2029')
    })
  })

  describe('escapeRegExpFallback — high code points + lone surrogates', () => {
    it('uHHHH-escapes a lone surrogate (per code unit)', () => {
      // U+D800 is a lone high surrogate.
      expect(escapeRegExpFallback('\ud800')).toBe('\\ud800')
    })

    it('passes a valid astral char (e.g. emoji) through verbatim', () => {
      // Emoji 🌍 is U+1F30D — not in the escape set, falls into the
      // verbatim branch.
      expect(escapeRegExpFallback('🌍')).toBe('🌍')
    })
  })

  describe('escapeRegExpFallback — verbatim default', () => {
    it('passes through ordinary punctuation that has no escape rule', () => {
      expect(escapeRegExpFallback(' _')).toBe('\\x20_')
    })

    it('preserves Unicode letters not in the escape set', () => {
      // Cyrillic letter — not in [0-9A-Za-z], not in escape set.
      expect(escapeRegExpFallback('я')).toBe('я')
    })
  })

  describe('isSpecHexEscapeCp', () => {
    it('returns true for OTHER_PUNCTUATORS', () => {
      expect(isSpecHexEscapeCp(0x2c)).toBe(true) // ,
      expect(isSpecHexEscapeCp(0x2d)).toBe(true) // -
      expect(isSpecHexEscapeCp(0x3d)).toBe(true) // =
      expect(isSpecHexEscapeCp(0x23)).toBe(true) // #
      expect(isSpecHexEscapeCp(0x21)).toBe(true) // !
    })

    it('returns true for line terminators', () => {
      expect(isSpecHexEscapeCp(0x0a)).toBe(true) // LF
      expect(isSpecHexEscapeCp(0x0d)).toBe(true) // CR
      expect(isSpecHexEscapeCp(0x20_28)).toBe(true) // LS
      expect(isSpecHexEscapeCp(0x20_29)).toBe(true) // PS
    })

    it('returns true for whitespace code points', () => {
      expect(isSpecHexEscapeCp(0x09)).toBe(true) // TAB
      expect(isSpecHexEscapeCp(0x0b)).toBe(true) // VT
      expect(isSpecHexEscapeCp(0x0c)).toBe(true) // FF
      expect(isSpecHexEscapeCp(0x20)).toBe(true) // SP
      expect(isSpecHexEscapeCp(0xa0)).toBe(true) // NBSP
      expect(isSpecHexEscapeCp(0xfe_ff)).toBe(true) // ZWNBSP
    })

    it('returns true for lone surrogates', () => {
      expect(isSpecHexEscapeCp(0xd8_00)).toBe(true)
      expect(isSpecHexEscapeCp(0xdc_00)).toBe(true)
      expect(isSpecHexEscapeCp(0xdf_ff)).toBe(true)
    })

    it('returns false for ordinary letters', () => {
      expect(isSpecHexEscapeCp(0x61)).toBe(false) // a
      expect(isSpecHexEscapeCp(0x41)).toBe(false) // A
      expect(isSpecHexEscapeCp(0x30)).toBe(false) // 0
    })

    it('returns false for high (non-surrogate, non-special) code points', () => {
      expect(isSpecHexEscapeCp(0x1_f3_0d)).toBe(false) // 🌍
    })
  })
})
