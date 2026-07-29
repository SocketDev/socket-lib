/**
 * @file Differential guard for `normalizePath`.
 *   Two independent checks pin the segment walk:
 *
 *   1. A golden fixture — every corpus input's normalized output, recorded
 *      byte-for-byte. Any change to `normalizePath` that moves a single output
 *      fails here with the offending input named.
 *   2. A property check that `indexOfPathSeparator` agrees with `search(str,
 *      /[/\\]/, { fromIndex })` for every string and index. The segment walk
 *      uses the char-code scan for its separator lookups, so this pins the scan
 *      to the regex semantics it stands in for. Regenerate the fixture after an
 *      intentional behavior change with `UPDATE_NORMALIZE_GOLDEN=1 pnpm test
 *      test/unit/paths/normalize-golden.test.mts` and review the resulting diff
 *      — it is the full blast radius of the change.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { indexOfPathSeparator } from '../../../src/paths/_internal'
import { normalizePath } from '../../../src/paths/normalize'
import { search } from '../../../src/strings/search'

import { normalizePathCorpus } from './normalize-corpus.mts'

const GOLDEN_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'normalize.golden.json',
)

// The regexp the segment walk's separator lookups are specified against.
const SLASH_REGEXP = /[/\\]/

describe('paths/normalize — differential guard', () => {
  const corpus = normalizePathCorpus()

  it('should produce a stable, duplicate-free corpus', () => {
    expect(corpus.length).toBeGreaterThan(7000)
    expect(new Set(corpus).size).toBe(corpus.length)
  })

  it('should match the golden output for every corpus input', () => {
    const actual = corpus.map(input => normalizePath(input))

    if (process.env['UPDATE_NORMALIZE_GOLDEN']) {
      // Two-space indent matches the repo formatter, so a regenerated fixture
      // lands format-clean.
      writeFileSync(GOLDEN_PATH, `${JSON.stringify(actual, undefined, 2)}\n`)
    }

    const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as string[]

    expect(golden.length).toBe(corpus.length)

    // Compare per-input so a failure names the offending path instead of
    // dumping a multi-thousand-entry array diff.
    const mismatches: string[] = []
    for (let i = 0, { length } = corpus; i < length; i += 1) {
      if (actual[i] !== golden[i]) {
        mismatches.push(
          `${JSON.stringify(corpus[i])}: expected ${JSON.stringify(
            golden[i],
          )}, got ${JSON.stringify(actual[i])}`,
        )
      }
    }
    expect(mismatches).toStrictEqual([])
  })

  it('should scan separators exactly as the slash regexp matches them', () => {
    const alphabet = ['/', '\\', 'a', '.', ':', 'ü', '日', ' ']
    // Deterministic LCG so a failure is reproducible.
    let seed = 12_345
    const nextRandom = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
      return seed / 2_147_483_648
    }

    let checks = 0
    const mismatches: string[] = []
    for (let round = 0; round < 4000; round += 1) {
      const length = (nextRandom() * 24) | 0
      let str = ''
      for (let i = 0; i < length; i += 1) {
        str += alphabet[(nextRandom() * alphabet.length) | 0]
      }
      for (let fromIndex = 0; fromIndex <= str.length; fromIndex += 1) {
        const scanned = indexOfPathSeparator(str, fromIndex)
        const searched = search(str, SLASH_REGEXP, { fromIndex })
        if (scanned !== searched) {
          mismatches.push(
            `${JSON.stringify(str)} from ${fromIndex}: scan ${scanned}, search ${searched}`,
          )
        }
        checks += 1
      }
    }

    expect(mismatches).toStrictEqual([])
    expect(checks).toBeGreaterThan(40_000)
  })
})
