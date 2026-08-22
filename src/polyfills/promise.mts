/**
 * @file Shims for the `Promise` statics newer than Node >= 18.
 *   `Promise.withResolvers` landed in Node 22, `Promise.try` in Node 23.
 *   Neither algorithm is the risky part; the details a hand-rolled version
 *   skips are. `try` has to catch a SYNCHRONOUS throw from the callback and
 *   reject with it rather than letting it escape, and it has to forward extra
 *   arguments, which the obvious `new Promise(r => r(fn()))` spelling drops.
 */

import { PromiseCtor } from '../primordials/promise.mjs'
import { ReflectApply } from '../primordials/reflect.mjs'

export interface PromiseWithResolvers<T> {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown | undefined) => void
}

export type PromiseTryFn = <T, A extends unknown[]>(
  fn: (...args: A) => T | PromiseLike<T>,
  ...args: A
) => Promise<Awaited<T>>

export type WithResolversFn = <T>() => PromiseWithResolvers<T>

/**
 * The native `Promise.try`, or undefined below Node 23.
 */
export const promiseTryNative: PromiseTryFn | undefined =
  typeof (PromiseCtor as { try?: unknown | undefined }).try === 'function'
    ? <T, A extends unknown[]>(
        fn: (...args: A) => T | PromiseLike<T>,
        ...args: A
      ) =>
        (
          PromiseCtor as unknown as {
            try: (
              fn: (...args: A) => T | PromiseLike<T>,
              ...args: A
            ) => Promise<Awaited<T>>
          }
        ).try(fn, ...args)
    : undefined

/**
 * `Promise.try` shim.
 *
 * The call sits INSIDE the executor so a synchronous throw becomes a rejection,
 * which is the whole reason the method exists.
 */
export function promiseTryShim<T, A extends unknown[]>(
  fn: (...args: A) => T | PromiseLike<T>,
  ...args: A
): Promise<Awaited<T>> {
  return new PromiseCtor<Awaited<T>>((resolve, reject) => {
    try {
      resolve(ReflectApply(fn, undefined, args) as Awaited<T>)
    } catch (e) {
      reject(e)
    }
  })
}

export const promiseTry: PromiseTryFn = promiseTryNative ?? promiseTryShim

/**
 * The native `Promise.withResolvers`, or undefined below Node 22.
 */
export const promiseWithResolversNative: WithResolversFn | undefined =
  typeof (PromiseCtor as { withResolvers?: unknown | undefined })
    .withResolvers === 'function'
    ? <T,>() =>
        (
          PromiseCtor as unknown as {
            withResolvers: () => PromiseWithResolvers<T>
          }
        ).withResolvers()
    : undefined

/**
 * `Promise.withResolvers` shim.
 *
 * The executor runs synchronously during construction, so both functions are
 * assigned before the constructor returns and the assertions below are sound
 * rather than optimistic.
 */
export function promiseWithResolversShim<T>(): PromiseWithResolvers<T> {
  let resolve: ((value: T | PromiseLike<T>) => void) | undefined
  let reject: ((reason?: unknown | undefined) => void) | undefined
  const promise = new PromiseCtor<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, reject: reject!, resolve: resolve! }
}

export const promiseWithResolvers: WithResolversFn =
  promiseWithResolversNative ?? promiseWithResolversShim
