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
  newPromiseCapability,
  promiseTry,
  promiseTryNative,
  promiseTryShim,
  promiseTrySpecShim,
  promiseWithResolvers,
  promiseWithResolversNative,
  promiseWithResolversShim,
  promiseWithResolversSpecShim,
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

describe('newPromiseCapability', () => {
  it('builds a promise from the given constructor', async () => {
    const { promise, resolve } = newPromiseCapability<number>(Promise)
    resolve(4)
    await expect(promise).resolves.toBe(4)
  })

  it('honors a subclass, so the result is an instance of it', () => {
    class SubPromise<T> extends Promise<T> {}
    const { promise } = newPromiseCapability<number>(SubPromise)
    const isSubclass = promise instanceof SubPromise
    expect(isSubclass).toBe(true)
  })

  it('throws a TypeError when the receiver is not a constructor', () => {
    expect(() => newPromiseCapability(undefined)).toThrow(TypeError)
    expect(() => newPromiseCapability(42)).toThrow(TypeError)
    expect(() => newPromiseCapability({})).toThrow(TypeError)
  })

  it('propagates a throw from the constructor', () => {
    class Boom {
      constructor() {
        throw new Error('ctor boom')
      }
    }
    expect(() => newPromiseCapability(Boom)).toThrow('ctor boom')
  })

  it('throws when the constructor never calls its executor', () => {
    // Without both resolvers there is no capability, so resolving would
    // silently do nothing rather than fail.
    class Silent {
      executor: unknown
      constructor(executor: unknown) {
        // Stored, never called, so neither resolver is handed back.
        this.executor = executor
      }
    }
    expect(() => newPromiseCapability(Silent)).toThrow(TypeError)
  })
})

describe('the this-generic spec shims', () => {
  it('promiseTrySpecShim builds an instance of its receiver', async () => {
    class SubPromise<T> extends Promise<T> {}
    const out = promiseTrySpecShim.call(SubPromise, () => 1)
    const isSubclass = out instanceof SubPromise
    expect(isSubclass).toBe(true)
    await expect(out).resolves.toBe(1)
  })

  it('promiseTrySpecShim rejects a non-constructor receiver', () => {
    expect(() => promiseTrySpecShim.call(undefined, () => 1)).toThrow(TypeError)
  })

  it('promiseWithResolversSpecShim builds an instance of its receiver', () => {
    class SubPromise<T> extends Promise<T> {}
    const { promise, resolve } = promiseWithResolversSpecShim.call(SubPromise)
    resolve(undefined)
    const isSubclass = promise instanceof SubPromise
    expect(isSubclass).toBe(true)
  })

  it('promiseWithResolversSpecShim rejects a non-constructor receiver', () => {
    expect(() => promiseWithResolversSpecShim.call(1)).toThrow(TypeError)
  })

  it('the ergonomic shims need no receiver and build a real Promise', async () => {
    // This is why both shapes exist: internal callers use them as plain
    // functions, where there is no `this` to read a constructor from.
    const isPromise = promiseWithResolversShim().promise instanceof Promise
    expect(isPromise).toBe(true)
    await expect(promiseTryShim(() => 2)).resolves.toBe(2)
  })
})
