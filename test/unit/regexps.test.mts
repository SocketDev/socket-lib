/**
 * @fileoverview Unit tests for `escapeRegExp`.
 *
 * Tests align with the TC39 RegExp.escape spec:
 * https://tc39.es/ecma262/#sec-regexp.escape
 *
 * Assertions are BEHAVIOR-based (the escaped output produces a regex that
 * matches the original input exactly) plus targeted SPEC-SHAPE checks for
 * the two invariants that matter for safe concatenation:
 *   1. Leading `[0-9A-Za-z]` is encoded as `\xHH` so it can't merge with
 *      a preceding `\0..\9` / `\c` in a larger pattern.
 *   2. `/` is backslash-escaped so the result is safe inside a `/.../`
 *      literal.
 *
 * We verify the same guarantees hold whether `escapeRegExp` is bound to
 * native `RegExp.escape` (Node 24+) or our hand-rolled fallback.
 */

import { describe, expect, it } from 'vitest'

import { escapeRegExp } from '@socketsecurity/lib/regexps'

/** `new RegExp(escapeRegExp(input))` must match exactly `input`. */
function expectLiteralRoundtrip(input: string): void {
  const re = new RegExp(`^${escapeRegExp(input)}$`)
  expect(re.test(input)).toBe(true)
}

describe('regexps', () => {
  describe('escapeRegExp', () => {
    it('is a function (native or fallback)', () => {
      expect(typeof escapeRegExp).toBe('function')
    })

    it('empty string returns empty string', () => {
      expect(escapeRegExp('')).toBe('')
    })

    // Spec §22.2.5.1 step 3.a: leading `[0-9A-Za-z]` → `\xHH`.
    it('encodes leading ASCII letter/digit as \\xHH', () => {
      expect(escapeRegExp('a')).toBe('\\x61')
      expect(escapeRegExp('Z')).toBe('\\x5a')
      expect(escapeRegExp('0')).toBe('\\x30')
      expect(escapeRegExp('9')).toBe('\\x39')
      // Trailing letters/digits are NOT hex-escaped.
      expect(escapeRegExp('abc').startsWith('\\x61')).toBe(true)
      expect(escapeRegExp('abc').endsWith('bc')).toBe(true)
    })

    // Spec §22.2.5.1.1 step 1: SyntaxCharacter + `/` → backslash prefix.
    it('backslash-prefixes SyntaxCharacter + /', () => {
      for (const ch of '^$\\.*+?()[]{}|/') {
        expect(escapeRegExp(ch)).toBe('\\' + ch)
      }
    })

    // Spec §22.2.5.1.1 step 2: ControlEscape (Table 62).
    it('encodes control-escape characters as their escape forms', () => {
      expect(escapeRegExp('\t')).toBe('\\t')
      expect(escapeRegExp('\n')).toBe('\\n')
      expect(escapeRegExp('\v')).toBe('\\v')
      expect(escapeRegExp('\f')).toBe('\\f')
      expect(escapeRegExp('\r')).toBe('\\r')
    })

    // Spec §22.2.5.1.1 step 4: otherPunctuators → \xHH (cp ≤ 0xFF).
    it('hex-escapes the otherPunctuators set', () => {
      for (const ch of ',-=<>#&!%:;@~\'`"') {
        const cp = ch.codePointAt(0)!
        expect(escapeRegExp(ch)).toBe('\\x' + cp.toString(16).padStart(2, '0'))
      }
    })

    // Critical for the character-class splice use case.
    it('escaped `-` stays literal inside a character class', () => {
      const escaped = escapeRegExp('a-z')
      const re = new RegExp(`^[${escaped}]$`)
      expect(re.test('a')).toBe(true)
      expect(re.test('-')).toBe(true)
      expect(re.test('z')).toBe(true)
      // Letter between a and z must NOT match if `-` stayed literal.
      expect(re.test('m')).toBe(false)
    })

    // Behavior-level roundtrip: any metacharacter-only string must match
    // itself literally after escape.
    it('every metacharacter round-trips as a literal match', () => {
      for (const ch of '\\|{}()[]^$+*?.-/') {
        expectLiteralRoundtrip(ch)
      }
    })

    it('paired metacharacters round-trip', () => {
      for (const pair of ['{}', '()', '[]', '{{', '}}']) {
        expectLiteralRoundtrip(pair)
      }
    })

    it('every metacharacter in one string round-trips', () => {
      expectLiteralRoundtrip('.*+?^${}()|[]/\\-')
    })

    it('round-trips mixed plain + metacharacter strings', () => {
      for (const s of [
        'hello.world',
        'test(123)',
        'price: $50+',
        '*.{js,ts}',
        'a{1,3}',
      ]) {
        expectLiteralRoundtrip(s)
      }
    })

    it('round-trips plain ASCII strings', () => {
      for (const s of ['abc123', 'hello world', 'foo', '123']) {
        expectLiteralRoundtrip(s)
      }
    })

    // A sanity check that metacharacter meaning is neutralized, not just
    // that the input string matches itself (which a `.*` regex would
    // trivially satisfy).
    it('escaped `.` does not act as a wildcard', () => {
      const re = new RegExp(`^${escapeRegExp('test.file')}$`)
      expect(re.test('test.file')).toBe(true)
      expect(re.test('testXfile')).toBe(false)
    })

    it('escaped quantifier does not quantify', () => {
      const re = new RegExp(`^${escapeRegExp('a{1,3}')}$`)
      expect(re.test('a{1,3}')).toBe(true)
      expect(re.test('aaa')).toBe(false)
    })

    it('escaped `*` does not act as a wildcard in a glob-like input', () => {
      const re = new RegExp(`^${escapeRegExp('*.{js,ts}')}$`)
      expect(re.test('*.{js,ts}')).toBe(true)
      expect(re.test('foo.js')).toBe(false)
    })

    it('round-trips unicode characters', () => {
      expectLiteralRoundtrip('hello世界')
      expectLiteralRoundtrip('test.世界')
    })

    // Spec guarantees safe concatenation into any Pattern context.
    it('escaped output is safe to splice between arbitrary regex fragments', () => {
      const middle = escapeRegExp('1.2.3')
      const re = new RegExp(`^v${middle}-release$`)
      expect(re.test('v1.2.3-release')).toBe(true)
      expect(re.test('vX2X3-release')).toBe(false)
    })
  })
})
