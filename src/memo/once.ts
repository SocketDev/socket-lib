/**
 * @file `once` — zero-argument memoizer. Caches a single result forever and
 *   emits `set` / `hit` debug events. Distinct from `memoize` because it skips
 *   the key-gen / TTL / LRU machinery that the general-purpose memoizer needs.
 */

import { debugLog } from '../debug/output'

/**
 * Simple once() for zero-argument initialization functions. Caches a single
 * result forever and emits debug-log events on hit/miss.
 *
 * @example
 *   import { once } from '@socketsecurity/lib/memo/once'
 *
 *   const initialize = once(() => {
 *     console.log('Initializing…')
 *     return loadConfig()
 *   })
 *
 *   initialize() // Logs "Initializing…" and returns config
 *   initialize() // Returns cached config (no log)
 *
 * @param fn - Zero-argument function to run once.
 *
 * @returns Memoized version that only executes once
 */
export function once<Result>(fn: () => Result): () => Result {
  let called = false
  let result: Result

  return function memoized(): Result {
    if (!called) {
      result = fn()
      called = true
      debugLog(`[once:${fn.name}] set`)
    } else {
      debugLog(`[once:${fn.name}] hit`)
    }
    return result
  }
}
