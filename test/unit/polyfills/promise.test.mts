/*
 * @file Unit tests for the Promise-static shims.
 *
 *   Both the native and the shim branch are driven explicitly. On an engine that
 *   ships these methods the `<name>` export resolves to the native one, so
 *   without naming the shim directly its branch would never execute and would
 *   ship untested.
 */

import { describe, expect, it } from 'vitest'

import {
  promiseTry,
  promiseTryNative,
  promiseTryShim,
  promiseWithResolvers,
  promiseWithResolversNative,
  promiseWithResolversShim,
} from '../../../src/polyfills/promise.mjs'

describe('promiseWithResolvers', () => {
  for (const [label, withResolvers] of [
    ['shim', promiseWithResolversShim],
    ['selected', promiseWithResolvers],
  ] as const) {
    describe(label, () => {
      it('resolves through the returned resolve', async () => {
        const { promise, resolve } = withResolvers<number>()
        resolve(7)
        await expect(promise).resolves.toBe(7)
      })

      it('rejects through the returned reject', async () => {
        const { promise, reject } = withResolvers<number>()
        reject(new Error('nope'))
        await expect(promise).rejects.toThrow('nope')
      })

      it('hands back both functions synchronously', () => {
        // The executor runs during construction, so neither can still be
        // undefined by the time the object is returned.
        const bag = withResolvers<void>()
        expect(typeof bag.resolve).toBe('function')
        expect(typeof bag.reject).toBe('function')
        bag.resolve()
      })

      it('adopts a thenable passed to resolve', async () => {
        const { promise, resolve } = withResolvers<number>()
        resolve(Promise.resolve(3))
        await expect(promise).resolves.toBe(3)
      })
    })
  }

  it('prefers the native method when the engine has one', () => {
    const picked = promiseWithResolversNative ?? promiseWithResolversShim
    const selectedIsPicked = promiseWithResolvers === picked
    expect(selectedIsPicked).toBe(true)
  })
})

describe('promiseTry', () => {
  for (const [label, promiseTryFn] of [
    ['shim', promiseTryShim],
    ['selected', promiseTry],
  ] as const) {
    describe(label, () => {
      it('resolves a plain return value', async () => {
        await expect(promiseTryFn(() => 1)).resolves.toBe(1)
      })

      it('turns a synchronous throw into a rejection', async () => {
        // The reason the method exists: this must NOT escape to the caller.
        await expect(
          promiseTryFn(() => {
            throw new Error('sync boom')
          }),
        ).rejects.toThrow('sync boom')
      })

      it('adopts a returned promise', async () => {
        await expect(promiseTryFn(() => Promise.resolve(2))).resolves.toBe(2)
      })

      it('propagates a returned rejection', async () => {
        await expect(
          promiseTryFn(() => Promise.reject(new Error('async boom'))),
        ).rejects.toThrow('async boom')
      })

      it('forwards extra arguments to the callback', async () => {
        // The obvious `new Promise(r => r(fn()))` spelling drops these.
        await expect(
          promiseTryFn((a: number, b: number) => a + b, 2, 3),
        ).resolves.toBe(5)
      })

      it('never runs the callback more than once', async () => {
        let calls = 0
        await promiseTryFn(() => {
          calls += 1
          return calls
        })
        expect(calls).toBe(1)
      })
    })
  }

  it('prefers the native method when the engine has one', () => {
    const picked = promiseTryNative ?? promiseTryShim
    const selectedIsPicked = promiseTry === picked
    expect(selectedIsPicked).toBe(true)
  })
})
