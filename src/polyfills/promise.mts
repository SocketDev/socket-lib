/**
 * @file Shims for the `Promise` statics newer than Node >= 18.
 *   `Promise.withResolvers` landed in Node 22, `Promise.try` in Node 23.
 *   Neither algorithm is the risky part; the details a hand-rolled version
 *   skips are. `try` has to catch a SYNCHRONOUS throw from the callback and
 *   reject with it rather than letting it escape, and it has to forward extra
 *   arguments, which the obvious `new Promise(r => r(fn()))` spelling drops.
 *   Both statics are `this`-generic: called on a `Promise` subclass they build
 *   an instance of that subclass, and called on something that is not a
 *   constructor they throw. Each one therefore has two exports: a `*SpecShim`
 *   that reads its constructor from `this`, which is what a global install
 *   uses, and the plain shim, which is the ergonomic free function this package
 *   calls internally and which always builds a real `Promise`.
 */

import { TypeErrorCtor } from '../primordials/error.mjs'
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
 * The spec's NewPromiseCapability over an arbitrary constructor.
 *
 * A non-constructor throws a TypeError, which is what makes both statics
 * `this`-generic rather than hardwired to `Promise`. The executor runs
 * synchronously during construction, so both functions are assigned before this
 * returns; a constructor that fails to call it leaves them undefined, and the
 * spec throws for that too.
 */
export function newPromiseCapability<T>(
  ctor: unknown,
): PromiseWithResolvers<T> {
  if (typeof ctor !== 'function') {
    throw new TypeErrorCtor('The receiver must be a constructor')
  }
  let resolve: ((value: T | PromiseLike<T>) => void) | undefined
  let reject: ((reason?: unknown | undefined) => void) | undefined
  const promise = new (ctor as PromiseConstructor)<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  if (typeof resolve !== 'function' || typeof reject !== 'function') {
    throw new TypeErrorCtor('The constructor did not supply both resolvers')
  }
  return { promise, reject, resolve }
}

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
 * `Promise.try` shim, always building a real `Promise`.
 */
export function promiseTryShim<T, A extends unknown[]>(
  fn: (...args: A) => T | PromiseLike<T>,
  ...args: A
): Promise<Awaited<T>> {
  return ReflectApply(promiseTrySpecShim, PromiseCtor, [
    fn,
    ...args,
  ]) as Promise<Awaited<T>>
}

/**
 * `Promise.try` in its spec shape: the constructor comes from `this`.
 *
 * The call sits INSIDE the try so a synchronous throw becomes a rejection,
 * which is the whole reason the method exists.
 */
export function promiseTrySpecShim<T, A extends unknown[]>(
  this: unknown,
  fn: (...args: A) => T | PromiseLike<T>,
  ...args: A
): Promise<Awaited<T>> {
  const capability = newPromiseCapability<Awaited<T>>(this)
  try {
    capability.resolve(ReflectApply(fn, undefined, args) as Awaited<T>)
  } catch (e) {
    capability.reject(e)
  }
  return capability.promise
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
 * `Promise.withResolvers` shim, always building a real `Promise`.
 */
export function promiseWithResolversShim<T>(): PromiseWithResolvers<T> {
  return newPromiseCapability<T>(PromiseCtor)
}

/**
 * `Promise.withResolvers` in its spec shape: the constructor comes from `this`.
 */
export function promiseWithResolversSpecShim<T>(
  this: unknown,
): PromiseWithResolvers<T> {
  return newPromiseCapability<T>(this)
}

export const promiseWithResolvers: WithResolversFn =
  promiseWithResolversNative ?? promiseWithResolversShim
