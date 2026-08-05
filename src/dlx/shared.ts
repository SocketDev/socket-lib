/**
 * @file Shared internals for the `dlx/*` module — the bounded LRU cache used by
 *   `resolveBinaryPath` on Windows. Webpack-safe lazy `node:fs` / `node:path` /
 *   `node:crypto` loaders live in the canonical
 *   `@socketsecurity/lib/node/{fs,path,crypto}` helpers — import `getNodeFs` /
 *   `getNodePath` / `getNodeCrypto` directly from there.
 */

import { MapCtor } from '../primordials/map-set'

// Cache for binary path resolution to avoid repeated extension checks
// on Windows. Bounded LRU: a long-running process that resolves many
// distinct binary paths used to accumulate entries forever, and entries
// for paths that have since been garbage-collected by `cleanDlxCache`
// were never reclaimed. Map iteration order = insertion order; accessing
// an entry re-inserts it to bump recency.
export const BINARY_PATH_CACHE_MAX_SIZE = 200
export const binaryPathCache = new MapCtor<string, string>()

export function binaryPathCacheSet(key: string, value: string): void {
  if (binaryPathCache.has(key)) {
    binaryPathCache.delete(key)
  } else if (binaryPathCache.size >= BINARY_PATH_CACHE_MAX_SIZE) {
    const oldest = binaryPathCache.keys().next().value
    if (oldest !== undefined) {
      binaryPathCache.delete(oldest)
    }
  }
  binaryPathCache.set(key, value)
}
