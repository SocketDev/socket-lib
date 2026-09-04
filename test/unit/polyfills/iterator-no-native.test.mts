/**
 * @file The iterator helpers on an engine that ships none of them. Every
 *   `<name>` export in the index picks the native method when the engine has
 *   one and the shim otherwise, and the running Node has them all — so the
 *   shim half of every pick was chosen at module load and never taken. Hiding
 *   both sources the index reads, the `Iterator` global and the helper
 *   prototype, makes the Node-18 path the one that runs. The global has to go
 *   before the import, because the index resolves its statics once at module
 *   load.
 */

import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock(import('../../../src/polyfills/iterator/shared.mts'), async orig => ({
  ...(await orig()),
  // An engine below Node 22 has no %IteratorHelperPrototype%, so every lookup
  // against it comes back empty.
  iteratorPrototypeOf: () => Object.create(null),
}))

import type * as IteratorIndex from '../../../src/polyfills/iterator/index.mjs'

let iterators: typeof IteratorIndex

beforeAll(async () => {
  Reflect.deleteProperty(globalThis, 'Iterator')
  iterators = await import('../../../src/polyfills/iterator/index.mjs')
})

function counter(limit: number): IterableIterator<number> {
  function* generate() {
    for (let i = 0; i < limit; i += 1) {
      yield i
    }
  }
  return generate()
}

describe('the native lookups', () => {
  it('find no prototype helper to bridge', () => {
    expect(iterators.iteratorDropNative).toBeUndefined()
    expect(iterators.iteratorMapNative).toBeUndefined()
    expect(iterators.iteratorToArrayNative).toBeUndefined()
  })

  it('find no static to bridge', () => {
    expect(iterators.iteratorConcatNative).toBeUndefined()
    expect(iterators.iteratorFromNative).toBeUndefined()
  })
})

describe('the exported helpers on that engine', () => {
  it('map through the shim', () => {
    expect(
      iterators.iteratorToArray(
        iterators.iteratorMap(counter(3), (n: number) => n * 2),
      ),
    ).toEqual([0, 2, 4])
  })

  it('filter through the shim', () => {
    expect(
      iterators.iteratorToArray(
        iterators.iteratorFilter(counter(5), (n: number) => n % 2 === 0),
      ),
    ).toEqual([0, 2, 4])
  })

  it('drop and take through the shim', () => {
    expect(
      iterators.iteratorToArray(iterators.iteratorTake(counter(9), 2)),
    ).toEqual([0, 1])
    expect(
      iterators.iteratorToArray(iterators.iteratorDrop(counter(4), 2)),
    ).toEqual([2, 3])
  })

  it('flatMap through the shim', () => {
    expect(
      iterators.iteratorToArray(
        iterators.iteratorFlatMap(counter(2), n => [n, n]),
      ),
    ).toEqual([0, 0, 1, 1])
  })

  it('reduce, some, every, and find through the shim', () => {
    expect(
      iterators.iteratorReduce(counter(4), (a: number, b: number) => a + b),
    ).toBe(6)
    expect(iterators.iteratorSome(counter(4), (n: number) => n === 3)).toBe(
      true,
    )
    expect(iterators.iteratorEvery(counter(4), (n: number) => n < 4)).toBe(true)
    expect(iterators.iteratorFind(counter(4), (n: number) => n > 1)).toBe(2)
  })

  it('forEach through the shim', () => {
    const seen: number[] = []
    iterators.iteratorForEach(counter(3), (n: number) => {
      seen.push(n)
    })
    expect(seen).toEqual([0, 1, 2])
  })

  it('concat and from through the shim', () => {
    expect(
      iterators.iteratorToArray(
        iterators.iteratorConcat(counter(2), counter(2)),
      ),
    ).toEqual([0, 1, 0, 1])
    expect(
      iterators.iteratorToArray(iterators.iteratorFrom(counter(2))),
    ).toEqual([0, 1])
  })
})
