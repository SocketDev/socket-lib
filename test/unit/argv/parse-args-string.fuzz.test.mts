/**
 * @file Property/fuzz tests for argv/parse-args-string.
 *   `parseArgsString` is an untrusted-input tokenizer (config files, `bin`
 *   fields, shellout fixtures). The load-bearing property is that it never
 *   throws or hangs on ANY string and always yields an array of strings.
 *   Beyond that we pin an oracle for the "safe word" subset where the
 *   tokenization is knowable without reimplementing the parser.
 */

import fc from 'fast-check'
import { describe, expect, test } from 'vitest'

import { parseArgsString } from '../../../src/argv/parse-args-string'

// Characters that carry no shell meaning: no whitespace, quotes, backslash,
// glob metachars, `$`, comment `#`, or operator chars. A run of these is a
// single bare token whose value survives tokenization verbatim, which makes
// the parse outcome predictable without duplicating the SUT.
const SAFE_CHARS =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-.:/@+='

const safeWord = fc
  .array(fc.constantFrom(...SAFE_CHARS), { minLength: 1, maxLength: 12 })
  .map(chars => chars.join(''))

const safeWords = fc.array(safeWord, { minLength: 0, maxLength: 8 })

// Only spaces/tabs (no newline oddities) so `.join` of them stays inside the
// "whitespace collapses to a separator" contract.
const whitespaceOnly = fc
  .array(fc.constantFrom(' ', '\t'), { minLength: 1, maxLength: 20 })
  .map(chars => chars.join(''))

describe('argv/parse-args-string (fuzz)', () => {
  // Invariant + never-throws: the whole point for an untrusted parser. The
  // module doc promises "turn ANY command string into argv" and the existing
  // suite pins that malformed input (e.g. an unterminated quote) is tolerated
  // rather than thrown. The fuzz caught that a malformed `${…}` substitution
  // (`${`, `${x`, `a${}`) threw `Bad substitution` out of the vendored parser;
  // parseArgsString now degrades to a whitespace split instead of propagating.
  test('never throws and always returns an array of strings for any input', () => {
    const shellSoup = fc
      .array(
        fc.constantFrom(
          '"',
          "'",
          '\\',
          '$',
          '`',
          '#',
          '|',
          '&',
          ';',
          '<',
          '>',
          '(',
          ')',
          '*',
          '?',
          '{',
          '}',
          ' ',
          '\t',
          '\n',
          'a',
          '=',
        ),
        { maxLength: 40 },
      )
      .map(chars => chars.join(''))
    fc.assert(
      fc.property(fc.oneof(fc.string(), shellSoup), cmd => {
        const argv = parseArgsString(cmd)
        expect(Array.isArray(argv)).toBe(true)
        for (const entry of argv) {
          expect(typeof entry).toBe('string')
        }
      }),
    )
  })

  // Oracle (derived-from-input): safe words joined by single spaces tokenize
  // back to exactly those words. Constructed so the answer is known.
  test('round-trips safe words joined by single spaces', () => {
    fc.assert(
      fc.property(safeWords, words => {
        expect(parseArgsString(words.join(' '))).toEqual(words)
      }),
    )
  })

  // Round-trip via double quotes: wrapping each safe word in double quotes
  // strips the quotes and recovers the original words.
  test('round-trips safe words wrapped in double quotes', () => {
    fc.assert(
      fc.property(safeWords, words => {
        const cmd = words.map(w => `"${w}"`).join(' ')
        expect(parseArgsString(cmd)).toEqual(words)
      }),
    )
  })

  // Round-trip via single quotes.
  test('round-trips safe words wrapped in single quotes', () => {
    fc.assert(
      fc.property(safeWords, words => {
        const cmd = words.map(w => `'${w}'`).join(' ')
        expect(parseArgsString(cmd)).toEqual(words)
      }),
    )
  })

  // Restricted-input invariant: arbitrary runs of spaces/tabs collapse to no
  // tokens at all.
  test('returns [] for whitespace-only input', () => {
    fc.assert(
      fc.property(whitespaceOnly, ws => {
        expect(parseArgsString(ws)).toEqual([])
      }),
    )
  })

  // Derived characteristic: for safe-word input, no emitted token is empty and
  // none contains embedded whitespace (words were whitespace-free by
  // construction and separators are stripped).
  test('safe-word tokens are non-empty and whitespace-free', () => {
    fc.assert(
      fc.property(safeWords, words => {
        const argv = parseArgsString(words.join(' '))
        for (const token of argv) {
          expect(token.length).toBeGreaterThan(0)
          expect(/\s/.test(token)).toBe(false)
        }
      }),
    )
  })

  // Insensitivity to surrounding whitespace: padding a safe command with
  // arbitrary leading/trailing/interior extra spaces yields the same tokens.
  test('is insensitive to leading/trailing/collapsed whitespace', () => {
    fc.assert(
      fc.property(
        safeWords,
        whitespaceOnly,
        whitespaceOnly,
        (words, lead, tail) => {
          const padded = `${lead}${words.join('  ')}${tail}`
          expect(parseArgsString(padded)).toEqual(words)
        },
      ),
    )
  })
})
