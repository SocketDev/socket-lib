import { expect, test, vi } from 'vitest'

import {
  innerRecordOf,
  iteratorDropShim,
  iteratorFilterShim,
  iteratorFlatMapShim,
  iteratorTakeShim,
} from '../../../../src/polyfills/iterator/lazy.mjs'

test.each([iteratorFilterShim, iteratorFlatMapShim])(
  '%s closes on invalid callbacks before reading next',
  create => {
    const next = vi.fn()
    const close = vi.fn()
    expect(() =>
      Reflect.apply(create, undefined, [
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
    expect(next).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledOnce()
  },
)

test.each([iteratorDropShim, iteratorTakeShim])(
  '%s finishes on exhausted input',
  create => {
    const next = vi.fn(() => ({ done: true, value: undefined }))
    const helper = create({ next }, 10)
    expect(helper.next()).toEqual({ done: true, value: undefined })
    expect(helper.next()).toEqual({ done: true, value: undefined })
    expect(next).toHaveBeenCalledOnce()
  },
)

test('filter closes quietly and preserves a predicate error', () => {
  const failure = new Error('predicate failure')
  const close = vi.fn(() => {
    throw new Error('close failure')
  })
  const helper = iteratorFilterShim(
    { next: () => ({ done: false, value: 1 }), return: close },
    () => {
      throw failure
    },
  )
  expect(() => helper.next()).toThrow(failure)
  expect(close).toHaveBeenCalledOnce()
})

test('flatMap accepts a plain iterator and closes inner before outer on return', () => {
  const events: string[] = []
  const inner = {
    next: () => ({ done: false, value: 2 }),
    return() {
      events.push('inner')
      throw new Error('inner close')
    },
  }
  const outer = {
    next: () => ({ done: false, value: 1 }),
    return() {
      events.push('outer')
    },
  }
  const helper = iteratorFlatMapShim(outer, () => inner)
  expect(helper.next()).toEqual({ done: false, value: 2 })
  expect(helper.return?.()).toEqual({ done: true, value: undefined })
  expect(events).toEqual(['inner', 'outer'])
})

test('flatMap closes the outer source when the inner iterator throws', () => {
  const failure = new Error('inner next failure')
  const close = vi.fn(() => {
    throw new Error('outer close')
  })
  const helper = iteratorFlatMapShim(
    { next: () => ({ done: false, value: 1 }), return: close },
    () => ({
      next() {
        throw failure
      },
    }),
  )
  expect(() => helper.next()).toThrow(failure)
  expect(close).toHaveBeenCalledOnce()
  expect(helper.next()).toEqual({ done: true, value: undefined })
})

test.each([{ [Symbol.iterator]: 7 }, { [Symbol.iterator]: () => 7 }])(
  'rejects invalid inner iterable protocol %j',
  source => {
    expect(() => innerRecordOf(source)).toThrow(TypeError)
  },
)
