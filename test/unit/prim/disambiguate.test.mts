/**
 * @file Unit tests for tools/prim/src/disambiguate — the pure half of the
 *   receiver-type audit: verdict parsing, cache keying, cache loading, and
 *   snippet windowing. No SDK is loaded and no model is called; `loadSdk` is
 *   lazy precisely so these paths stay reachable without one.
 */

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, test } from 'vitest'

import {
  buildSnippet,
  cachePath,
  computeKey,
  loadCache,
  parseResponse,
  saveCache,
} from '../../../tools/prim/src/disambiguate.mjs'
import { safeDeleteSync } from '@socketsecurity/lib-stable/fs/safe'

const scratchDirs: string[] = []

function makeRoot(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'prim-disambiguate-'))
  scratchDirs.push(dir)
  return dir
}

afterEach(() => {
  while (scratchDirs.length) {
    safeDeleteSync(scratchDirs.pop()!)
  }
})

describe('parseResponse', () => {
  const candidates = ['Array', 'String']

  test('a named candidate verdict is taken, with its reason', () => {
    const result = parseResponse(
      'VERDICT: Array\nREASON: the receiver is built by map()',
      candidates,
    )
    assert.deepStrictEqual(result, {
      type: 'Array',
      reason: 'the receiver is built by map()',
    })
  })

  test('no VERDICT line answers undefined with a named reason', () => {
    // The caller distinguishes "the model declined" from "the model was not
    // understood", so the reason string is the contract, not just the type.
    assert.deepStrictEqual(parseResponse('nothing useful here', candidates), {
      type: undefined,
      reason: 'no-verdict-line',
    })
  })

  test('Other and Unsure are declines, not failures', () => {
    for (const raw of ['Other', 'Unsure']) {
      assert.deepStrictEqual(
        parseResponse(`VERDICT: ${raw}\nREASON: cannot tell`, candidates),
        { type: undefined, reason: 'cannot tell' },
      )
    }
  })

  test('a verdict outside the candidate set is rejected and says so', () => {
    const result = parseResponse('VERDICT: Buffer', candidates)
    assert.equal(result.type, undefined)
    assert.match(result.reason, /unexpected verdict "Buffer"/)
    assert.match(result.reason, /Array, String/)
  })

  test('a verdict with no reason gets the placeholder reason', () => {
    assert.deepStrictEqual(parseResponse('VERDICT: String', candidates), {
      type: 'String',
      reason: '(no reason supplied)',
    })
  })

  test('leading whitespace on either line still parses', () => {
    assert.deepStrictEqual(
      parseResponse('  VERDICT: Array\n   REASON:  padded  ', candidates),
      { type: 'Array', reason: 'padded' },
    )
  })
})

describe('computeKey', () => {
  test('the same inputs hash the same', () => {
    assert.equal(
      computeKey('map', 'items', 'const items = []'),
      computeKey('map', 'items', 'const items = []'),
    )
  })

  test('each input changes the hash on its own', () => {
    const base = computeKey('map', 'items', 'src')
    assert.notEqual(base, computeKey('filter', 'items', 'src'))
    assert.notEqual(base, computeKey('map', 'others', 'src'))
    assert.notEqual(base, computeKey('map', 'items', 'other src'))
  })

  test('the fields cannot be smeared into one another', () => {
    // Separator-free concatenation would collide these two, and a collision
    // means one call site reuses another's verdict.
    assert.notEqual(computeKey('ab', 'c', 'src'), computeKey('a', 'bc', 'src'))
  })
})

describe('loadCache', () => {
  test('an absent cache reads as empty rather than throwing', () => {
    const cache = loadCache(makeRoot())
    assert.deepStrictEqual(cache.entries, {})
  })

  test('a round trip through saveCache returns the entries', () => {
    const root = makeRoot()
    const saved = loadCache(root)
    saved.entries['abc'] = { type: 'Array', reason: 'because' }
    saveCache(root, saved)
    assert.deepStrictEqual(loadCache(root).entries, {
      abc: { type: 'Array', reason: 'because' },
    })
  })

  test('malformed JSON reads as empty rather than throwing', () => {
    const root = makeRoot()
    const file = cachePath(root)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, '{ not json')
    assert.deepStrictEqual(loadCache(root).entries, {})
  })

  test('a schema mismatch reads as empty and leaves the file in place', () => {
    // Deliberately NOT deleted: the operator may want the previous shape.
    const root = makeRoot()
    const file = cachePath(root)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify({ schema: -1, entries: { a: 1 } }))
    assert.deepStrictEqual(loadCache(root).entries, {})
    assert.match(String(loadCache(root).schema), /^\d+$/)
  })

  test('a null payload reads as empty', () => {
    const root = makeRoot()
    const file = cachePath(root)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, 'null')
    assert.deepStrictEqual(loadCache(root).entries, {})
  })
})

describe('cachePath', () => {
  test('the cache sits under the target root, never the cwd', () => {
    const root = makeRoot()
    assert.ok(cachePath(root).startsWith(root + path.sep))
    assert.ok(cachePath(root).includes('.prim-cache'))
  })
})

describe('buildSnippet', () => {
  const src = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join('\n')
  const lineStarts: number[] = []
  {
    const lines = src.split(/\r?\n/)
    let offset = 0
    for (let i = 0, { length } = lines; i < length; i += 1) {
      lineStarts.push(offset)
      offset += lines[i]!.length + 1
    }
  }

  test('a window in the middle carries the context lines each side', () => {
    const snippet = buildSnippet(src, lineStarts, 20, 2)
    assert.ok(snippet.includes('line 18'))
    assert.ok(snippet.includes('line 20'))
    assert.ok(snippet.includes('line 22'))
    assert.ok(!snippet.includes('line 17'))
  })

  test('a window at the top clamps to line 1 instead of going negative', () => {
    const snippet = buildSnippet(src, lineStarts, 2, 8)
    assert.ok(snippet.startsWith('line 1'))
  })

  test('a window at the bottom clamps to the last line', () => {
    const snippet = buildSnippet(src, lineStarts, 39, 8)
    assert.ok(snippet.endsWith('line 40'))
  })

  test('a context wider than the file returns the whole file', () => {
    assert.equal(buildSnippet(src, lineStarts, 20, 999), src)
  })
})
