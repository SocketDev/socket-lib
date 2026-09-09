import { expect, test, vi } from 'vitest'

import {
  inheritsFromIteratorPrototype,
  iteratorConcatShim,
  iteratorFromShim,
  recordFromIterableOrIterator,
  wrappedTargetOf,
} from '../../../../src/polyfills/iterator/statics.mjs'

const behavior = vi.hoisted(() => ({ missingStringIterator: false }))
vi.mock(
  import('../../../../src/primordials/reflect.mjs'),
  async importOriginal => {
    const actual = await importOriginal()
    return {
      ...actual,
      ReflectGet: vi.fn<typeof actual.ReflectGet>((target, key, receiver) => {
        if (
          behavior.missingStringIterator &&
          key === Symbol.iterator &&
          typeof receiver === 'string'
        ) {
          return actual.ReflectGet({}, key, receiver)
        }
        return actual.ReflectGet(target, key, receiver)
      }),
    }
  },
)

test.each([undefined, 1, false])(
  'primitive %s has no iterator prototype or wrapper brand',
  value => {
    expect(inheritsFromIteratorPrototype(value)).toBe(false)
    expect(() => wrappedTargetOf(value)).toThrow(TypeError)
  },
)

test('unbranded objects cannot borrow wrapper state', () => {
  expect(() => wrappedTargetOf({})).toThrow(TypeError)
})

test('prototype inspection bounds hostile cyclic proxy chains', () => {
  const target = {}
  let visits = 0
  function getPrototypeOf(): object {
    visits += 1
    return cyclic
  }
  const cyclic: object = new Proxy(target, { getPrototypeOf })
  expect(inheritsFromIteratorPrototype(cyclic)).toBe(false)
  expect(visits).toBe(101)
})

test.each([{ [Symbol.iterator]: 7 }, { [Symbol.iterator]: () => 7 }])(
  'from rejects invalid iterable protocol %j',
  source => {
    expect(() => recordFromIterableOrIterator(source)).toThrow(TypeError)
  },
)

test('wrappers reject non-callable methods and synthesize an absent return', () => {
  expect(() => iteratorFromShim({ next: 7 }).next()).toThrow(TypeError)
  expect(
    iteratorFromShim({ next: () => ({ done: false, value: 1 }) }).return?.(),
  ).toEqual({ done: true, value: undefined })
  expect(() =>
    iteratorFromShim({
      next: () => ({ done: false, value: 1 }),
      return: 7,
    }).return?.(),
  ).toThrow(TypeError)
})

test('concat validates iterator methods before consuming and rejects primitive iterators', () => {
  expect(() => iteratorConcatShim({ [Symbol.iterator]: 7 })).toThrow(TypeError)
  const helper = iteratorConcatShim({ [Symbol.iterator]: () => 7 })
  expect(() => helper.next()).toThrow(TypeError)
})

test('concat return closes only the active input', () => {
  const close = vi.fn(() => ({ done: true, value: undefined }))
  const later = vi.fn(() => [2][Symbol.iterator]())
  const helper = iteratorConcatShim(
    {
      [Symbol.iterator]: () => ({
        next: () => ({ done: false, value: 1 }),
        return: close,
      }),
    },
    { [Symbol.iterator]: later },
  )
  expect(helper.next()).toEqual({ done: false, value: 1 })
  expect(helper.return?.()).toEqual({ done: true, value: undefined })
  expect(close).toHaveBeenCalledOnce()
  expect(later).not.toHaveBeenCalled()
})

test('a string without its iterable method cannot act as a plain iterator', () => {
  behavior.missingStringIterator = true
  try {
    expect(() => recordFromIterableOrIterator('example')).toThrow(TypeError)
  } finally {
    behavior.missingStringIterator = false
  }
})
