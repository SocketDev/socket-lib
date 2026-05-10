/**
 * @fileoverview ECMA-262 standalone async helpers — `withResolvers`
 * (Promise.withResolvers) and `fromAsync` (Array.fromAsync). Both
 * prefer the captured primordial when present, with a spec-equivalent
 * fallback for older runtimes.
 *
 * Why this lives separate from `retry.ts` / `iterate.ts`: these are
 * direct mirrors of standardized JS APIs, not Socket-specific
 * helpers. They have no retry / concurrency surface to share with
 * the rest of the module.
 */

import {
  ArrayFromAsync,
  PromiseCtor,
  PromiseWithResolvers as NativePromiseWithResolvers,
} from '../primordials'

import type { PromiseWithResolvers } from './types'

/**
 * Drain an async iterable into an array, per
 * [TC39 Array.fromAsync](https://tc39.es/proposal-array-from-async/).
 *
 * Uses the `ArrayFromAsync` primordial (already bound) when available
 * (Node 22+; V8 ≥ 12.0); otherwise falls back to a `for await…of` +
 * push loop.
 *
 * Use this instead of the manual
 * `const out = []; for await (const x of iter) out.push(x); return out`
 * dance when collecting an async iterator's values.
 *
 * Like the native, this only handles the unary form (no `mapFn` /
 * `thisArg` overload).
 *
 * @example
 * ```typescript
 * import { glob } from 'node:fs/promises'
 * const files = await fromAsync(glob('**\/*.ts', { cwd: '/tmp/proj' }))
 * ```
 */
export const fromAsync: <T>(
  source: AsyncIterable<T> | Iterable<T | PromiseLike<T>>,
) => Promise<T[]> =
  ArrayFromAsync !== undefined
    ? (ArrayFromAsync as <T>(
        source: AsyncIterable<T> | Iterable<T | PromiseLike<T>>,
      ) => Promise<T[]>)
    : async <T>(
        source: AsyncIterable<T> | Iterable<T | PromiseLike<T>>,
      ): Promise<T[]> => {
        const out: T[] = []
        for await (const item of source as AsyncIterable<T>) {
          out.push(item)
        }
        return out
      }

/**
 * Create a pending promise together with its `resolve` and `reject`
 * handles as first-class values, per
 * [ECMA-262 §27.2.4.9](https://tc39.es/ecma262/#sec-promise.withResolvers).
 *
 * Uses the `PromiseWithResolvers` primordial (already bound) when
 * available (Node 20.12+ / 21+ / 22+; V8 ≥ 12.0); otherwise falls back
 * to a spec-equivalent `new Promise(executor)` that captures the
 * handles via closure. The returned object always has own data
 * properties `promise`, `resolve`, `reject` on `Object.prototype` —
 * writable, enumerable, and configurable — matching the spec's
 * `CreateDataPropertyOrThrow` steps.
 *
 * Use this instead of the manual
 * `let resolve; const p = new Promise(r => { resolve = r })` dance for
 * deferred-resolution patterns (event-driven bridges, adapter layers,
 * handshake signaling) where the settle path lives outside the executor.
 *
 * @example
 * ```typescript
 * const { promise, resolve, reject } = withResolvers<string>()
 * emitter.once('ready', () => resolve('ok'))
 * emitter.once('error', err => reject(err))
 * const result = await promise
 * ```
 */
export const withResolvers: <T>() => PromiseWithResolvers<T> =
  NativePromiseWithResolvers !== undefined
    ? (NativePromiseWithResolvers as <T>() => PromiseWithResolvers<T>)
    : <T>(): PromiseWithResolvers<T> => {
        // Fallback: capture resolvers via closure. The `!` asserts hold
        // because Promise's executor runs synchronously, so both handles
        // are assigned before the constructor returns.
        let resolve!: (value: T | PromiseLike<T>) => void
        let reject!: (reason?: unknown) => void
        const promise = new PromiseCtor<T>((res, rej) => {
          resolve = res
          reject = rej
        })
        return { promise, resolve, reject }
      }
