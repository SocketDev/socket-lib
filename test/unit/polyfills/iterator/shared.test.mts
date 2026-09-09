import { expect, test, vi } from 'vitest'

import {
  assertObjectReceiver,
  closeIteratorQuietly,
  closeOnThrow,
  iteratorRecordOf,
  makeIteratorHelper,
  stateOf,
} from '../../../../src/polyfills/iterator/shared.mjs'

test.each([undefined, 0, 'iterator', true])(
  'rejects primitive iterator receiver %s',
  value => {
    expect(() => assertObjectReceiver(value)).toThrow(TypeError)
    expect(() => stateOf(value)).toThrow(TypeError)
  },
)

test('captures next once and rejects non-callable and primitive results on stepping', () => {
  const next = vi.fn(() => 7)
  const source = { next }
  const record = iteratorRecordOf(source)
  source.next = vi.fn(() => 8)
  expect(() => record.next()).toThrow(TypeError)
  expect(next).toHaveBeenCalledOnce()
  expect(source.next).not.toHaveBeenCalled()
  expect(() => iteratorRecordOf({ next: 0 }).next()).toThrow(TypeError)
})

test('coercion errors close the receiver without replacing the pending error', () => {
  const failure = new Error('coercion failure')
  const close = vi.fn(() => {
    throw new Error('close failure')
  })
  expect(() =>
    closeOnThrow({ return: close }, () => {
      throw failure
    }),
  ).toThrow(failure)
  expect(close).toHaveBeenCalledOnce()
  expect(() => closeIteratorQuietly({ return: 0 })).not.toThrow()
})

test('return closes once and both reentrant operations reject during close', () => {
  const close = vi.fn(() => {
    expect(() => helper.next()).toThrow(TypeError)
    expect(() => helper.return?.()).toThrow(TypeError)
  })
  const helper = makeIteratorHelper({
    close,
    done: false,
    running: false,
    step: () => ({ done: false, value: 1 }),
  })
  expect(helper.return?.()).toEqual({ done: true, value: undefined })
  expect(helper.return?.()).toEqual({ done: true, value: undefined })
  expect(helper.next()).toEqual({ done: true, value: undefined })
  expect(close).toHaveBeenCalledOnce()
})

test('a throwing close finishes the helper and clears its running state', () => {
  const failure = new Error('close failure')
  const close = vi.fn(() => {
    throw failure
  })
  const helper = makeIteratorHelper({
    close,
    done: false,
    running: false,
    step: () => ({ done: false, value: 1 }),
  })
  expect(() => helper.return?.()).toThrow(failure)
  expect(stateOf(helper).running).toBe(false)
  expect(helper.return?.()).toEqual({ done: true, value: undefined })
  expect(close).toHaveBeenCalledOnce()
})

test('quiet close preserves a pending error when reading return throws', () => {
  const failure = new Error('coercion failure')
  const source = {
    get return(): never {
      throw new Error('return getter failure')
    },
  }
  expect(() =>
    closeOnThrow(source, () => {
      throw failure
    }),
  ).toThrow(failure)
})
