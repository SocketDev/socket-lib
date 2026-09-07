/**
 * Tests surface filtering and the generated bundle consumer.
 */

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

import { safeDelete } from '@socketsecurity/lib-stable/fs/safe'

import { describe, test } from 'vitest'

import {
  stringMap,
  stringSet,
  transformPrimordials,
} from '../../../scripts/repo/build-externals/transform-primordials.mts'

describe('stringSet', () => {
  test('keeps the string members', () => {
    assert.deepEqual(
      [...stringSet(['ArrayIsArray', 'ObjectKeys'])],
      ['ArrayIsArray', 'ObjectKeys'],
    )
  })

  test('preserves iteration order', () => {
    assert.deepEqual([...stringSet(['b', 'a', 'c'])], ['b', 'a', 'c'])
  })

  test('drops a non-string member instead of admitting it', () => {
    // The whole point of narrowing rather than asserting.
    assert.deepEqual(
      [...stringSet(['ok', 7, undefined, false, {}, 'fine'])],
      ['ok', 'fine'],
    )
  })

  test('dedupes, since a Set is the target shape', () => {
    assert.equal(stringSet(['dup', 'dup']).size, 1)
  })

  test('answers an empty set for empty input', () => {
    assert.equal(stringSet([]).size, 0)
  })

  test('keeps the empty string, which is a string', () => {
    // Not filtering on truthiness: the test is `typeof`, so '' survives. It
    // would be a bug for a name filter to also drop falsy-but-valid values.
    assert.deepEqual([...stringSet([''])], [''])
  })

  test('accepts any iterable, not just an array', () => {
    assert.deepEqual([...stringSet(new Set(['a', 'b']))], ['a', 'b'])
  })
})

describe('stringMap', () => {
  test('keeps string-to-string entries', () => {
    assert.deepEqual(
      [
        ...stringMap([
          ['ArrayIsArray', 'array'],
          ['ObjectKeys', 'object'],
        ]),
      ],
      [
        ['ArrayIsArray', 'array'],
        ['ObjectKeys', 'object'],
      ],
    )
  })

  test('drops an entry whose VALUE is not a string', () => {
    assert.deepEqual([...stringMap([['name', 7]])], [])
  })

  test('drops an entry whose KEY is not a string', () => {
    // Both halves are tested, so a one-sided check cannot pass.
    assert.deepEqual([...stringMap([[7, 'leaf']])], [])
  })

  test('keeps the good entries alongside a bad one', () => {
    assert.deepEqual(
      [
        ...stringMap([
          ['keep', 'leaf'],
          // typeof {} is 'object', the same class of key the narrowing drops.
          [{}, 'leaf'],
          ['alsoKeep', 'other'],
        ]),
      ],
      [
        ['keep', 'leaf'],
        ['alsoKeep', 'other'],
      ],
    )
  })

  test('last write wins on a repeated key, matching Map semantics', () => {
    assert.equal(
      stringMap([
        ['k', 'first'],
        ['k', 'second'],
      ]).get('k'),
      'second',
    )
  })

  test('answers an empty map for empty input', () => {
    assert.equal(stringMap([]).size, 0)
  })

  test('accepts a Map directly, which is how the surface arrives', () => {
    assert.deepEqual([...stringMap(new Map([['a', 'leaf']]))], [['a', 'leaf']])
  })
})

describe('transformPrimordials bundle consumer', () => {
  test('keeps an executable per-leaf rewrite and returns isolated counters', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'primordial-bundle-'))
    try {
      const sourceDir = path.join(root, 'src', 'primordials')
      const distDir = path.join(root, 'dist')
      const externalDir = path.join(distDir, 'external')
      const runtimeDir = path.join(distDir, 'primordials')
      for (const dir of [sourceDir, externalDir, runtimeDir]) {
        mkdirSync(dir, { recursive: true })
      }
      writeFileSync(
        path.join(sourceDir, 'array.mts'),
        'export const ArrayIsArray = Array.isArray',
      )
      writeFileSync(
        path.join(runtimeDir, 'array.js'),
        'exports.ArrayIsArray = Array.isArray',
      )
      const bundle = path.join(externalDir, 'example.js')
      writeFileSync(bundle, 'module.exports = Array.isArray([])')
      const result = await transformPrimordials(distDir, externalDir, {
        quiet: true,
      })
      assert.equal(Object.getPrototypeOf(result), null)
      assert.equal(result.filesChanged, 1)
      assert.equal(result.rewriteCount, 1)
      assert.equal(createRequire(import.meta.url)(bundle), true)
      const second = await transformPrimordials(distDir, externalDir, {
        quiet: true,
      })
      assert.equal(second.filesChanged, 0)
      assert.equal(second.rewriteCount, 0)
    } finally {
      await safeDelete(root)
    }
  })
})
