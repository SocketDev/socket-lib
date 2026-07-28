/**
 * @file Private internals for `secrets/` — process-scoped read cache for the
 *   keychain backend. Underscore-prefixed and skipped by the export generator
 *   (`dist/**\/_*` ignore pattern in
 *   `scripts/fleet/make-package-exports.mts`) so this module is NOT part
 *   of the public API surface. Imported by `./keychain.ts`. Every `readSecret`
 *   call shells out to the OS credential CLI (`security`, `secret-tool`,
 *   PowerShell). On macOS, the first read of a given entry by a new binary path
 *   triggers a Keychain auth prompt unless the entry was written with `-A -T
 *   ''` (which we now do — see `./macos.ts`). Even so, every read is a process
 *   spawn, which costs a few ms per call. For tools that read the same secret
 *   multiple times within one process (CLI commands handling multiple
 *   subcommands, MCP request handlers serving sibling endpoints), a
 *   process-scoped cache eliminates the redundant work. Lifetime: a single Node
 *   process. The cache lives in module-level state; importing this module from
 *   a child process gets a fresh cache. No persistence to disk — for that, see
 *   `./rc.ts` which materializes a one-time `export` block into the shell rc.
 *   Invalidation: callers MUST invalidate the cache when they write/delete the
 *   same `{service, account}` pair. The public keychain.ts wraps writeSecret /
 *   deleteSecret so cache eviction happens automatically. Concurrency:
 *   in-flight reads of the same key share a single Promise so two `await
 *   readSecret(...)` calls don't spawn two `security` processes for the same
 *   entry. Once the Promise resolves, the value is cached. If the read returns
 *   undefined (entry missing), `undefined` is cached too — callers that want a
 *   re-check after creating the entry must call `invalidate`.
 */

import { MapCtor } from '../primordials/map-set'

const valueCache = new MapCtor<string, string | undefined>()
const inflight = new MapCtor<string, Promise<string | undefined>>()

export function cacheKey(service: string, account: string): string {
  // ` ` is invalid in either a real service name or an
  // account name, so it's a safe separator that can't collide.
  return `${service} ${account}`
}

/**
 * Coordinate concurrent reads of the same key. The first caller registers a
 * Promise; subsequent callers receive the same Promise instead of spawning
 * another OS call. On settle, the Promise's inflight slot is dropped and the
 * value is cached.
 */
export async function dedupeRead(
  service: string,
  account: string,
  reader: () => Promise<string | undefined>,
): Promise<string | undefined> {
  const key = cacheKey(service, account)
  if (valueCache.has(key)) {
    return valueCache.get(key)
  }
  const existing = inflight.get(key)
  if (existing) {
    return existing
  }
  const promise = (async () => {
    try {
      const value = await reader()
      valueCache.set(key, value)
      return value
    } finally {
      inflight.delete(key)
    }
  })()
  inflight.set(key, promise)
  return promise
}

/**
 * Look up a cached value. Returns `undefined` for both "cached as absent" and
 * "not yet cached" — callers that need to distinguish those cases should use
 * `has` first.
 */
export function getCached(
  service: string,
  account: string,
): string | undefined {
  return valueCache.get(cacheKey(service, account))
}

export function has(service: string, account: string): boolean {
  return valueCache.has(cacheKey(service, account))
}

/**
 * Drop a cached value. Called by `writeSecret` / `deleteSecret` after the
 * underlying OS state changes so a subsequent `readSecret` reflects the new
 * reality. Also called by `invalidateAll()` for service-wide refreshes.
 */
export function invalidate(service: string, account: string): void {
  valueCache.delete(cacheKey(service, account))
  inflight.delete(cacheKey(service, account))
}

/**
 * Wipe the entire cache. Tests use this between cases; consumers generally
 * don't need it (process exit drops the cache anyway).
 */
export function invalidateAll(): void {
  valueCache.clear()
  inflight.clear()
}

/**
 * Store a value (or `undefined` to record an absent entry) so later reads of
 * the same key short-circuit the OS call.
 */
export function setCached(
  service: string,
  account: string,
  value: string | undefined,
): void {
  valueCache.set(cacheKey(service, account), value)
}
