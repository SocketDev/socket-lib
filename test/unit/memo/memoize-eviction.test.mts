/**
 * @file Tests for the bounded half of src/memo/memoize — `maxSize` and its LRU
 *   eviction. The sibling memoize.test.mts covers key generation; the eviction
 *   path had no coverage, which is the half that keeps a long-lived cache from
 *   growing without bound.
 */

import { describe, expect, it } from 'vitest'

import { memoize } from '../../../src/memo/memoize.mjs'

describe('memoize — maxSize eviction', () => {
  it('recomputes a key that was evicted', () => {
    let calls = 0
    const fn = memoize(
      (n: number) => {
        calls += 1
        return n
      },
      { maxSize: 2 },
    )

    fn(1)
    fn(2)
    expect(calls).toBe(2)

    // Third distinct key pushes the oldest out.
    fn(3)
    expect(calls).toBe(3)

    // Key 1 is gone, so this computes again rather than hitting cache.
    fn(1)
    expect(calls).toBe(4)
  })

  it('keeps the most recent key across an eviction', () => {
    let calls = 0
    const fn = memoize(
      (n: number) => {
        calls += 1
        return n
      },
      { maxSize: 2 },
    )

    fn(1)
    fn(2)
    fn(3)
    const before = calls

    // 3 was inserted last, so it survives.
    fn(3)
    expect(calls).toBe(before)
  })

  it('treats a read as recent, so the untouched key evicts first', () => {
    let calls = 0
    const fn = memoize(
      (n: number) => {
        calls += 1
        return n
      },
      { maxSize: 2 },
    )

    fn(1)
    fn(2)
    // Touch 1 so 2 becomes the oldest.
    fn(1)
    const afterTouch = calls

    fn(3)
    // 1 was refreshed by the read above and must still be cached.
    fn(1)
    expect(calls).toBe(afterTouch + 1)
  })

  it('holds every key when maxSize is not set', () => {
    let calls = 0
    const fn = memoize((n: number) => {
      calls += 1
      return n
    })

    for (let i = 0; i < 50; i += 1) {
      fn(i)
    }
    expect(calls).toBe(50)

    // All 50 are still resident: replaying them adds no computes.
    for (let i = 0; i < 50; i += 1) {
      fn(i)
    }
    expect(calls).toBe(50)
  })

  it('computes every call when maxSize is one and keys alternate', () => {
    let calls = 0
    const fn = memoize(
      (n: number) => {
        calls += 1
        return n
      },
      { maxSize: 1 },
    )

    fn(1)
    fn(2)
    fn(1)
    // Each call displaces the previous entry, so none of them hit.
    expect(calls).toBe(3)
  })

  it('caches a falsy result rather than recomputing it', () => {
    let calls = 0
    const fn = memoize(
      (_n: number) => {
        calls += 1
        return 0
      },
      { maxSize: 4 },
    )

    expect(fn(1)).toBe(0)
    expect(fn(1)).toBe(0)
    expect(calls).toBe(1)
  })
})
