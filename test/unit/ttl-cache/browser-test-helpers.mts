/**
 * @file Shared fakes for the browser TTL cache specs — a Map-backed async
 *   `TtlCacheStorage` adapter with call counters and toggleable enumeration /
 *   failure modes, plus a deferred-promise helper for concurrency tests.
 */

import type { TtlCacheStorage } from '../../../src/cache/ttl/types'

export interface AdapterCalls {
  getItem: number
  keys: number
  removeItem: number
  setItem: number
}

export interface Deferred<T> {
  promise: Promise<T>
  reject: (reason: unknown) => void
  resolve: (value: T) => void
}

export interface MemoryAdapter extends TtlCacheStorage {
  calls: AdapterCalls
  store: Map<string, string>
}

export interface MemoryAdapterOptions {
  /**
   * Provide the optional `keys()` enumeration.
   *
   * @default true
   */
  enumerable?: boolean | undefined
  /**
   * Make every adapter method (and `keys()` when present) reject.
   *
   * @default false
   */
  failing?: boolean | undefined
}

export function createDeferred<T>(): Deferred<T> {
  let reject!: (reason: unknown) => void
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, reject, resolve }
}

export function createMemoryAdapter(
  options?: MemoryAdapterOptions | undefined,
): MemoryAdapter {
  const opts = {
    __proto__: null,
    enumerable: true,
    failing: false,
    ...options,
  } as Required<MemoryAdapterOptions>
  const calls: AdapterCalls = { getItem: 0, keys: 0, removeItem: 0, setItem: 0 }
  const store = new Map<string, string>()
  const adapter: MemoryAdapter = {
    calls,
    async getItem(key: string) {
      calls.getItem += 1
      if (opts.failing) {
        throw new Error('storage getItem failed')
      }
      return store.get(key)
    },
    async removeItem(key: string) {
      calls.removeItem += 1
      if (opts.failing) {
        throw new Error('storage removeItem failed')
      }
      store.delete(key)
    },
    async setItem(key: string, value: string) {
      calls.setItem += 1
      if (opts.failing) {
        throw new Error('storage setItem failed')
      }
      store.set(key, value)
    },
    store,
  }
  if (opts.enumerable) {
    adapter.keys = async () => {
      calls.keys += 1
      if (opts.failing) {
        throw new Error('storage keys failed')
      }
      return [...store.keys()]
    }
  }
  return adapter
}
