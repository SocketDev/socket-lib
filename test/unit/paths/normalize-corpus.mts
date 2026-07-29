/**
 * @file Deterministic input corpus for the `normalizePath` golden test.
 *   `normalizePath` is among the most-called pure functions in the library, so
 *   its output is pinned byte-for-byte by a golden fixture. This module builds
 *   the input side of that fixture: cross-products of separator styles, Windows
 *   namespace and UNC prefixes, drive letters, dot segments, and unicode, plus
 *   hand-written edge cases the cross-products cannot reach. Generation is
 *   order-stable and duplicate-free, so the golden fixture stays diffable
 *   across regenerations. Regenerate the fixture with
 *   `UPDATE_NORMALIZE_GOLDEN=1 pnpm test
 *   test/unit/paths/normalize-golden.test.mts`.
 */

// Leading forms: bare relative, POSIX root, Windows roots, UNC, and the `\\?\`
// / `\\.\` namespace prefixes that normalizePath preserves.
const PREFIXES = [
  '',
  '/',
  '//',
  '///',
  '\\',
  '\\\\',
  '\\\\\\',
  '\\\\?\\',
  '\\\\.\\',
  '//?/',
  '//./',
  '/\\',
  '\\/',
  'C:',
  'C:/',
  'C:\\',
  'c:/',
  'D:\\',
  '\\\\server\\share\\',
  '//server/share/',
  '\\\\server\\',
  '/c/',
]

// Segment alphabet: ordinary names, both dot segments, a dot-run that must NOT
// be treated as a dot segment, unicode, an embedded space, a bare drive
// letter, and the empty segment that produces a repeated separator.
const SEGMENTS = ['a', 'foo', '.', '..', '...', 'ünïcødé', 'a b', 'C:', '']

// Inputs that the cross-products cannot express: degenerate lengths, `..` runs
// that pop past the root, and long paths that make an O(n^2) segment walk
// observable.
const EXPLICIT_CASES = [
  '',
  '.',
  '..',
  '...',
  './',
  '../',
  '/',
  '\\',
  '//',
  '\\\\',
  '///',
  '\\\\\\',
  'a',
  'ü',
  'C:',
  'C:/',
  'C:\\',
  'C:foo',
  'C:\\foo',
  'D:/',
  'D:\\',
  'z:',
  '1:',
  '::',
  ':',
  'node_modules',
  'a/b/c',
  'a\\b\\c',
  '../../..',
  '../../../a',
  '/../etc/passwd',
  '/../../..',
  'a/../..',
  'a/b/../../..',
  'a/./b/./c',
  '././././.',
  '..\\..\\..',
  '/a/../../b',
  '//server/share',
  '//server/share/',
  '//server',
  '//server/',
  '\\\\server',
  '\\\\server\\',
  '\\\\server\\share',
  '\\\\?\\C:\\foo',
  '\\\\?\\UNC\\server\\share',
  '\\\\.\\pipe\\name',
  '//?/C:/foo',
  '//./pipe/name',
  '/c/users/foo',
  '/c',
  '/c/',
  'foo bar/baz qux',
  '日本語/パス',
  'a'.repeat(1000),
  `${'a/'.repeat(500)}b`,
  `${'../'.repeat(200)}a`,
  `${'a/'.repeat(300)}${'../'.repeat(300)}b`,
  '/'.repeat(64),
  '\\'.repeat(64),
  `${'/'.repeat(8)}a${'\\'.repeat(8)}b`,
]

// Repeated and mixed separator runs, paired with a reduced prefix and segment
// set so the separator-skipping loops are covered without a combinatorial
// blowup in the fixture.
const RUN_PREFIXES = ['', '/', '\\', 'C:/', '//server/share/', '\\\\?\\']
const RUN_SEGMENTS = ['a', '.', '..', '']
const RUN_SEPARATORS = ['//', '\\\\', '/\\', '\\/', '///']
const RUN_SUFFIXES = ['', '//', '/.', '\\..']

/**
 * Emit every `prefix + first + separator + second + suffix` combination.
 *
 * @param {(input: string) => void} add - Sink for each generated input.
 * @param {string[]} prefixes - Leading forms.
 * @param {string[]} firsts - First segment alphabet.
 * @param {string[]} separators - Separator runs.
 * @param {string[]} seconds - Second segment alphabet.
 * @param {string[]} suffixes - Trailing forms.
 *
 * @returns {void}
 */
export function crossProduct(
  add: (input: string) => void,
  prefixes: string[],
  firsts: string[],
  separators: string[],
  seconds: string[],
  suffixes: string[],
): void {
  for (let a = 0, { length: aLen } = prefixes; a < aLen; a += 1) {
    const prefix = prefixes[a]!
    for (let b = 0, { length: bLen } = firsts; b < bLen; b += 1) {
      const first = firsts[b]!
      for (let c = 0, { length: cLen } = separators; c < cLen; c += 1) {
        const separator = separators[c]!
        for (let d = 0, { length: dLen } = seconds; d < dLen; d += 1) {
          const second = seconds[d]!
          for (let e = 0, { length: eLen } = suffixes; e < eLen; e += 1) {
            add(`${prefix}${first}${separator}${second}${suffixes[e]!}`)
          }
        }
      }
    }
  }
}

/**
 * Build the deterministic `normalizePath` input corpus.
 *
 * Emits the explicit edge cases, then the single-separator cross-product over
 * the full prefix and segment alphabets, then the repeated-separator product,
 * then a three-segment dot sweep. Duplicates are dropped while preserving
 * first-seen order so the fixture index of a case never shifts unless the
 * generator itself changes.
 *
 * @returns {string[]} The corpus inputs, in stable order with no duplicates.
 */
export function normalizePathCorpus(): string[] {
  const seen = new Set<string>()
  const corpus: string[] = []

  const add = (input: string) => {
    if (!seen.has(input)) {
      seen.add(input)
      corpus.push(input)
    }
  }

  for (let i = 0, { length } = EXPLICIT_CASES; i < length; i += 1) {
    add(EXPLICIT_CASES[i]!)
  }

  crossProduct(add, PREFIXES, SEGMENTS, ['/', '\\'], SEGMENTS, ['', '/'])
  crossProduct(
    add,
    RUN_PREFIXES,
    RUN_SEGMENTS,
    RUN_SEPARATORS,
    RUN_SEGMENTS,
    RUN_SUFFIXES,
  )

  // Three-segment sweep so a `..` can pop a segment that itself followed a
  // `..` — the branch that separates `a/../../b` from `a/b/../c`.
  const sweepPrefixes = ['', '/', 'C:/', '//server/share/']
  for (let a = 0, { length: aLen } = sweepPrefixes; a < aLen; a += 1) {
    const prefix = sweepPrefixes[a]!
    for (let b = 0, { length: bLen } = RUN_SEGMENTS; b < bLen; b += 1) {
      const first = RUN_SEGMENTS[b]!
      for (let c = 0, { length: cLen } = RUN_SEGMENTS; c < cLen; c += 1) {
        const second = RUN_SEGMENTS[c]!
        for (let d = 0, { length: dLen } = RUN_SEGMENTS; d < dLen; d += 1) {
          const third = RUN_SEGMENTS[d]!
          add(`${prefix}${first}/${second}/${third}`)
          add(`${prefix}${first}\\${second}\\${third}`)
        }
      }
    }
  }

  return corpus
}
