/**
 * @file Unit tests for promise resolver utilities. Tests the spec-compliant
 *   `withResolvers()` and `fromAsync()` helpers (both native-bound and
 *   closure-fallback paths) used across Socket tools for deferred resolution
 *   and async-iterable draining.
 */

import { fromAsync, withResolvers } from '../../src/promises/resolvers'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('promises', () => {
  describe('withResolvers', () => {
    // Spec: https://tc39.es/ecma262/#sec-promise.withResolvers
    // These tests exercise the feature-detect binding. On Node 20.12+ /
    // 22+ the export is bound to native Promise.withResolvers; on older
    // engines it's our fallback. Both paths must satisfy the spec.

    it('is a function', () => {
      expect(typeof withResolvers).toBe('function')
    })

    it('returns an object with promise, resolve, reject', () => {
      const d = withResolvers<number>()
      expect(d.promise).toBeInstanceOf(Promise)
      expect(typeof d.resolve).toBe('function')
      expect(typeof d.reject).toBe('function')
    })

    it('resolves the promise with the provided value', async () => {
      const { promise, resolve } = withResolvers<string>()
      resolve('hello')
      await expect(promise).resolves.toBe('hello')
    })

    it('rejects the promise with the provided reason', async () => {
      const { promise, reject } = withResolvers<number>()
      const err = new Error('boom')
      reject(err)
      await expect(promise).rejects.toBe(err)
    })

    it('adopts a thenable passed to resolve', async () => {
      const { promise, resolve } = withResolvers<number>()
      resolve(Promise.resolve(42))
      await expect(promise).resolves.toBe(42)
    })

    it('rejects when a rejected thenable is passed to resolve', async () => {
      const { promise, resolve } = withResolvers<number>()
      const err = new Error('inner')
      resolve(Promise.reject(err))
      await expect(promise).rejects.toBe(err)
    })

    it('settles exactly once — later resolve() calls are ignored', async () => {
      const { promise, resolve } = withResolvers<string>()
      resolve('first')
      resolve('second')
      await expect(promise).resolves.toBe('first')
    })

    it('settles exactly once — reject after resolve is ignored', async () => {
      const { promise, resolve, reject } = withResolvers<string>()
      resolve('ok')
      reject(new Error('late'))
      await expect(promise).resolves.toBe('ok')
    })

    it('supports deferred resolution from outside the executor', async () => {
      // The point of withResolvers: settle from code that doesn't own the
      // executor. Here an event-style callback closes over `resolve`.
      const { promise, resolve } = withResolvers<string>()
      setTimeout(() => resolve('fired'), 0)
      await expect(promise).resolves.toBe('fired')
    })

    it('each call returns a fresh, independent capability', async () => {
      const a = withResolvers<number>()
      const b = withResolvers<number>()
      expect(a.promise).not.toBe(b.promise)
      expect(a.resolve).not.toBe(b.resolve)
      a.resolve(1)
      b.resolve(2)
      await expect(a.promise).resolves.toBe(1)
      await expect(b.promise).resolves.toBe(2)
    })

    // Spec §27.2.4.9 step 3: `OrdinaryObjectCreate(%Object.prototype%)`.
    // The returned object is a plain object, not a Promise / subclass.
    it('returned object has Object.prototype as its prototype', () => {
      const d = withResolvers<number>()
      expect(Object.getPrototypeOf(d)).toBe(Object.prototype)
    })

    // Spec §27.2.4.9 steps 4-6: properties created via
    // `CreateDataPropertyOrThrow` — writable, enumerable, configurable.
    it('promise/resolve/reject are own enumerable properties', () => {
      const d = withResolvers<number>()
      const keys = Object.keys(d)
      expect(keys).toContain('promise')
      expect(keys).toContain('resolve')
      expect(keys).toContain('reject')
    })
  })

  // Explicit coverage of the fallback branch. On Node 20.12+ / 22+ the
  // module binds to native `Promise.withResolvers` at import time, so
  // normal runs exercise only the native path. Here we delete the native
  // method and re-import the module fresh, forcing the feature-detect
  // to pick the closure fallback.
  describe('withResolvers — fallback implementation', () => {
    const hadNative =
      typeof (Promise as unknown as { withResolvers?: unknown | undefined })
        .withResolvers === 'function'
    const nativeWithResolvers = hadNative
      ? (
          Promise as unknown as {
            withResolvers: () => unknown
          }
        ).withResolvers
      : undefined

    afterEach(() => {
      if (hadNative && nativeWithResolvers) {
        ;(
          Promise as unknown as { withResolvers: () => unknown }
        ).withResolvers = nativeWithResolvers
      }
      vi.resetModules()
    })

    async function loadFallback(): Promise<
      () => { promise: Promise<unknown>; resolve: Function; reject: Function }
    > {
      delete (Promise as unknown as { withResolvers?: unknown | undefined })
        .withResolvers
      vi.resetModules()
      // oxlint-disable-next-line socket/no-dynamic-import-outside-bundle -- exercises the fallback path after deleting Promise.withResolvers, which requires re-evaluating the module post-vi.resetModules.
      const mod = await import('../../src/promises/resolvers')
      return mod.withResolvers as () => {
        promise: Promise<unknown>
        resolve: Function
        reject: Function
      }
    }

    it('fallback is a function', async () => {
      const fallback = await loadFallback()
      expect(typeof fallback).toBe('function')
    })

    it('fallback returns { promise, resolve, reject } with correct types', async () => {
      const fallback = await loadFallback()
      const d = fallback()
      expect(d.promise).toBeInstanceOf(Promise)
      expect(typeof d.resolve).toBe('function')
      expect(typeof d.reject).toBe('function')
    })

    it('fallback resolves the promise with the provided value', async () => {
      const fallback = await loadFallback()
      const d = fallback()
      d.resolve('ok')
      await expect(d.promise).resolves.toBe('ok')
    })

    it('fallback rejects the promise with the provided reason', async () => {
      const fallback = await loadFallback()
      const d = fallback()
      const err = new Error('nope')
      d.reject(err)
      await expect(d.promise).rejects.toBe(err)
    })

    it('fallback adopts a thenable passed to resolve', async () => {
      const fallback = await loadFallback()
      const d = fallback()
      d.resolve(Promise.resolve(99))
      await expect(d.promise).resolves.toBe(99)
    })

    it('fallback settle-once semantics (later calls ignored)', async () => {
      const fallback = await loadFallback()
      const d = fallback()
      d.resolve('first')
      d.resolve('second')
      d.reject(new Error('late'))
      await expect(d.promise).resolves.toBe('first')
    })

    // Spec §27.2.4.9 step 3: return object has Object.prototype.
    it('fallback returns an ordinary object, not a Promise subclass', async () => {
      const fallback = await loadFallback()
      const d = fallback()
      expect(Object.getPrototypeOf(d)).toBe(Object.prototype)
    })

    it('fallback properties are own + enumerable', async () => {
      const fallback = await loadFallback()
      const d = fallback()
      const keys = Object.keys(d)
      expect(keys).toContain('promise')
      expect(keys).toContain('resolve')
      expect(keys).toContain('reject')
    })
  })

  describe('fromAsync', () => {
    // Spec: https://tc39.es/proposal-array-from-async/
    // On Node 22+ the export is bound to native Array.fromAsync; older
    // engines hit the closure fallback. Both paths must satisfy the spec.

    it('is a function', () => {
      expect(typeof fromAsync).toBe('function')
    })

    it('drains an async iterable into an array', async () => {
      async function* gen() {
        yield 1
        yield 2
        yield 3
      }
      await expect(fromAsync(gen())).resolves.toEqual([1, 2, 3])
    })

    it('returns an empty array for an empty async iterable', async () => {
      // eslint-disable-next-line require-yield
      async function* empty() {
        return
      }
      await expect(fromAsync(empty())).resolves.toEqual([])
    })

    it('preserves yield order', async () => {
      async function* gen() {
        yield 'b'
        yield 'a'
        yield 'c'
      }
      await expect(fromAsync(gen())).resolves.toEqual(['b', 'a', 'c'])
    })

    it('awaits each yielded value before pushing', async () => {
      async function* gen() {
        yield Promise.resolve(1)
        yield Promise.resolve(2)
      }
      // Spec: yielded thenables are awaited; resulting array contains
      // the resolved values, not the promises.
      const out = await fromAsync(gen())
      expect(out).toEqual([1, 2])
    })

    it('propagates rejection from the iterator', async () => {
      const err = new Error('boom')
      async function* gen() {
        yield 1
        throw err
      }
      await expect(fromAsync(gen())).rejects.toBe(err)
    })

    it('also drains plain (sync) iterables of awaitables', async () => {
      // Spec lets fromAsync accept Iterable<T | PromiseLike<T>> too.
      const out = await fromAsync([Promise.resolve('a'), Promise.resolve('b')])
      expect(out).toEqual(['a', 'b'])
    })
  })

  // Explicit coverage of the fallback branch. On Node 22+ the module
  // binds to native `Array.fromAsync` at import time; here we delete
  // the native method and re-import the module fresh, forcing the
  // feature-detect to pick the closure fallback.
  describe('fromAsync — fallback implementation', () => {
    const hadNative =
      typeof (Array as unknown as { fromAsync?: unknown | undefined })
        .fromAsync === 'function'
    const nativeFromAsync = hadNative
      ? (Array as unknown as { fromAsync: unknown }).fromAsync
      : undefined

    afterEach(() => {
      if (hadNative && nativeFromAsync !== undefined) {
        ;(Array as unknown as { fromAsync: unknown }).fromAsync =
          nativeFromAsync
      }
      vi.resetModules()
    })

    async function loadFallback(): Promise<
      <T>(
        source: AsyncIterable<T> | Iterable<T | PromiseLike<T>>,
      ) => Promise<T[]>
    > {
      delete (Array as unknown as { fromAsync?: unknown | undefined }).fromAsync
      vi.resetModules()
      // oxlint-disable-next-line socket/no-dynamic-import-outside-bundle -- exercises the fallback path after deleting Array.fromAsync.
      const mod = await import('../../src/promises/resolvers')
      return mod.fromAsync
    }

    it('fallback is a function', async () => {
      const fallback = await loadFallback()
      expect(typeof fallback).toBe('function')
    })

    it('fallback drains an async iterable into an array', async () => {
      const fallback = await loadFallback()
      async function* gen() {
        yield 'x'
        yield 'y'
      }
      await expect(fallback(gen())).resolves.toEqual(['x', 'y'])
    })

    it('fallback returns empty array for empty iterable', async () => {
      const fallback = await loadFallback()
      // eslint-disable-next-line require-yield
      async function* empty() {
        return
      }
      await expect(fallback(empty())).resolves.toEqual([])
    })

    it('fallback propagates rejection from the iterator', async () => {
      const fallback = await loadFallback()
      const err = new Error('fallback-boom')
      async function* gen() {
        yield 1
        throw err
      }
      await expect(fallback(gen())).rejects.toBe(err)
    })
  })
})
