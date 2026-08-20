/**
 * @file Unit coverage for the primordials-surface narrowing in
 *   scripts/repo/build-externals/transform-primordials.mts.
 *   `parseExports` in tools/prim builds its exports set and exportToLeaf map
 *   without element types, so the surface arrives as `Set<unknown>` /
 *   `Map<any, any>` and cannot satisfy applyCodemod's `Set<string>`. These two
 *   helpers narrow by TEST rather than by assertion, and that choice is what
 *   the specs pin: an assertion would claim a guarantee the producer does not
 *   make, whereas dropping a non-string name is correct — such a name could
 *   never drive a rewrite.
 */

import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import {
  stringMap,
  stringSet,
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
