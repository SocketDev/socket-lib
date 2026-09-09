import { expect, test, vi } from 'vitest'

import {
  iteratorEveryShim,
  iteratorFindShim,
  iteratorForEachShim,
  iteratorReduceShim,
  iteratorSomeShim,
} from '../../../../src/polyfills/iterator/eager.mjs'

const consumers = [
  iteratorEveryShim,
  iteratorFindShim,
  iteratorForEachShim,
  iteratorReduceShim,
  iteratorSomeShim,
]

test.each(consumers)(
  '%s closes before reading next when callback is invalid',
  consume => {
    const next = vi.fn(() => ({ done: true, value: undefined }))
    const close = vi.fn()
    expect(() =>
      Reflect.apply(consume, undefined, [
        {
          get next() {
            next()
            return next
          },
          return: close,
        },
        undefined,
      ]),
    ).toThrow(TypeError)
    expect(close).toHaveBeenCalledOnce()
    expect(next).not.toHaveBeenCalled()
  },
)

test.each(consumers)(
  '%s preserves callback failure even when return throws',
  consume => {
    const failure = new Error('callback failure')
    const close = vi.fn(() => {
      throw new Error('close failure')
    })
    const source = { next: () => ({ done: false, value: 1 }), return: close }
    expect(() =>
      Reflect.apply(consume, undefined, [
        source,
        () => {
          throw failure
        },
        0,
      ]),
    ).toThrow(failure)
    expect(close).toHaveBeenCalledOnce()
  },
)

test('some returns false after exhausting a source without closing it', () => {
  const close = vi.fn()
  const predicate = vi.fn(() => true)
  expect(
    iteratorSomeShim(
      { next: () => ({ done: true, value: undefined }), return: close },
      predicate,
    ),
  ).toBe(false)
  expect(predicate).not.toHaveBeenCalled()
  expect(close).not.toHaveBeenCalled()
})
