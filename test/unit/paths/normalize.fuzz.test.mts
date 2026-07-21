/**
 * @file Property/fuzz tests for paths/normalize `normalizePath`.
 *   `normalizePath` is a total string→string transform run on untrusted path
 *   input (URLs, uploads, lockfile entries). The load-bearing properties are
 *   that it never throws on ANY string, is idempotent, and emits POSIX-shaped
 *   output — no backslashes and no interior `//` runs (repeated separators
 *   collapse; only a leading UNC/namespace `//` survives). We also pin an
 *   oracle for the "clean relative segment" subset where the output is knowable
 *   without reimplementing the collapse logic, and a restricted-input law that
 *   pure separator runs normalize to `/`.
 */

import fc from 'fast-check'
import { describe, expect, test } from 'vitest'

import { normalizePath } from '../../../src/paths/normalize'

// Full-coverage string arbitrary: default graphemes, raw code points (lone
// surrogates included), and a separator-dense "path soup" that concentrates
// the metacharacters normalizePath actually branches on (slashes, dots,
// colons, drive letters, namespace markers).
const pathSoup = fc
  .array(
    fc.constantFrom(
      '/',
      '\\',
      '.',
      '..',
      ':',
      '?',
      'C',
      'c',
      'd',
      'server',
      'share',
      'foo',
      'bar',
      '',
      ' ',
    ),
    { maxLength: 30 },
  )
  .map(parts => parts.join(''))

const anyString = fc.oneof(fc.string(), fc.string({ unit: 'binary' }), pathSoup)

// Segment chars that survive normalization verbatim: no separators (`/` `\`),
// no `.` (so a segment can never be `.` or `..`), no `:` (so the drive-letter
// root special-case can't fire). A run of these is a whole path segment that
// passes through untouched, making the outcome knowable.
const SAFE_SEGMENT_CHARS =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-@+='

const safeSegment = fc
  .array(fc.constantFrom(...SAFE_SEGMENT_CHARS), {
    minLength: 1,
    maxLength: 10,
  })
  .map(chars => chars.join(''))

// A pure run of separators (any mix of `/` and `\`), length >= 1.
const separatorRun = fc
  .array(fc.constantFrom('/', '\\'), { minLength: 1, maxLength: 20 })
  .map(chars => chars.join(''))

describe('paths/normalize normalizePath (fuzz)', () => {
  // Invariant + never-throws: total function, always a non-empty string.
  test('never throws and always returns a non-empty string for any input', () => {
    fc.assert(
      fc.property(anyString, s => {
        const out = normalizePath(s)
        expect(typeof out).toBe('string')
        expect(out.length).toBeGreaterThan(0)
      }),
    )
  })

  // Invariant (idempotence): normalize(normalize(x)) === normalize(x).
  test('is idempotent', () => {
    fc.assert(
      fc.property(anyString, s => {
        const once = normalizePath(s)
        expect(normalizePath(once)).toBe(once)
      }),
    )
  })

  // Derived characteristic: output is POSIX-separated — never any backslash.
  test('output contains no backslash', () => {
    fc.assert(
      fc.property(anyString, s => {
        expect(normalizePath(s).includes('\\')).toBe(false)
      }),
    )
  })

  // Derived characteristic: repeated separators collapse. A `//` run can only
  // survive as a leading UNC/namespace prefix, so its only allowed position is
  // index 0.
  test('collapses separators — no interior double-slash run', () => {
    fc.assert(
      fc.property(anyString, s => {
        const idx = normalizePath(s).indexOf('//')
        expect(idx === -1 || idx === 0).toBe(true)
      }),
    )
  })

  // Determinism: guards against regex lastIndex / global-state carryover.
  test('is deterministic across repeated calls', () => {
    fc.assert(
      fc.property(anyString, s => {
        // Both calls outside expect() so neither is an "expected" builder
        // (socket/no-src-import-in-test-expect) — still catches any global
        // regex-state carryover between repeated calls.
        const first = normalizePath(s)
        const second = normalizePath(s)
        expect(second).toBe(first)
      }),
    )
  })

  // Oracle (derived-from-input): a clean relative path built from separator-,
  // dot- and colon-free segments joined by single slashes is already normal,
  // so it must round-trip unchanged.
  test('leaves a clean relative segment path unchanged', () => {
    fc.assert(
      fc.property(
        fc.array(safeSegment, { minLength: 1, maxLength: 8 }),
        segments => {
          const joined = segments.join('/')
          expect(normalizePath(joined)).toBe(joined)
        },
      ),
    )
  })

  // Restricted-input law: a path that is nothing but separators collapses to
  // the root `/`.
  test('normalizes a pure separator run to "/"', () => {
    fc.assert(
      fc.property(separatorRun, run => {
        expect(normalizePath(run)).toBe('/')
      }),
    )
  })
})
