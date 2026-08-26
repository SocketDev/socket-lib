/**
 * @file TTL caching for the npm registry API reads, mirroring the approach in
 *   socket-sdk-js `src/socket-sdk-class.mts`: a `TtlCache` whose `getOrFetch`
 *   both caches and deduplicates concurrent callers, plus a per-endpoint-class
 *   TTL rather than one number for the whole client.
 *   Two deliberate differences from the SDK. First, the cache is INJECTED
 *   instead of constructed here. The SDK builds its own with `createTtlCache`,
 *   which is backed by cacache and therefore Node-only; this surface has to
 *   keep working in a browser, so the caller supplies either `createTtlCache`
 *   (Node) or `createBrowserTtlCache` (browser). Caching stays off until they
 *   do, exactly like the SDK's `cache: false` default.
 *   Second, an authenticated read is NEVER cached. See `readThroughCache`.
 */

import type { TtlCache } from '../../cache/ttl/types.mjs'
import type { NpmOnAuth } from './auth.mjs'

/**
 * Advisory lookups, 60 seconds.
 *
 * The set of advisories against a fixed package version changes only when a
 * new advisory is published, which is rare, so a long TTL looks tempting. The
 * costs are not symmetric though: a stale "no advisories" answer hides a live
 * vulnerability from a caller that asked precisely in order to find it, while
 * a stale "has advisories" answer merely repeats a warning. Cache long enough
 * to collapse a burst from one scan, not long enough to outlive an
 * advisory going public.
 */
export const ADVISORY_TTL_MS = 60_000

/**
 * Search results, 5 minutes.
 *
 * Search is a ranked view over a corpus that changes continuously, so the
 * result is never "correct" for long and nothing downstream should treat it as
 * authoritative. 5 minutes matches `DEFAULT_CACHE_TTL` in socket-sdk-js
 * `src/constants.mts`, and is short enough that a package published minutes
 * ago still surfaces on a realistic retry.
 */
export const SEARCH_TTL_MS = 5 * 60 * 1000

/**
 * The endpoint classes that have a cache policy. Anything absent here is
 * uncached by design, not by omission.
 */
export type NpmCacheClass = 'advisory' | 'search'

/**
 * Per-class cache instances. Each `TtlCache` carries its own TTL, so honoring
 * different TTLs means holding different instances. This mirrors the SDK's
 * `#cacheByTtl` map; the difference is that the caller creates them, because
 * only the caller knows whether it is in Node or a browser.
 *
 * Create them with the matching TTL constant from this module:
 * `createTtlCache({ prefix: 'npm-search', ttl: SEARCH_TTL_MS })`.
 */
export interface NpmCacheSet {
  advisory?: TtlCache | undefined
  search?: TtlCache | undefined
}

/**
 * Caching configuration accepted by every cacheable read.
 *
 * `cache` is the fallback used when `caches` has no instance for the class
 * being read, matching the SDK's default-cache-plus-overrides layout.
 */
export interface NpmCacheOptions {
  cache?: TtlCache | undefined
  caches?: NpmCacheSet | undefined
}

/**
 * Build a cache key from the full request identity.
 *
 * Every part that changes the response has to be in the key, including the
 * registry: two registries answer the same query differently, and a shared
 * cache instance would otherwise serve one's answer for the other.
 */
export function buildNpmCacheKey(
  registry: string,
  operation: string,
  parts: ReadonlyArray<string | number | boolean | undefined>,
): string {
  const tail = parts.map(part => (part === undefined ? '' : String(part)))
  return [registry, operation, ...tail].join(':')
}

/**
 * Read through a cache when one applies, otherwise just fetch.
 *
 * An authenticated read is never cached, and `token` being present is what
 * turns caching off. Two reasons, both of which a per-token cache key would
 * only half-solve. A token decides WHAT the registry returns, so one token's
 * answer served to another is a disclosure, not a stale read. And keying by
 * the token means writing the token into a cache key, which for the Node store
 * means writing it to disk in cacache, where a credential does not belong.
 * Skipping is the option with no sharp edge, so this takes it.
 *
 * `onAuth` turns caching off for the same reason and one more. A driver's
 * answer is a one-time password or a freshly minted token, so a reply obtained
 * with one is both credential-scoped and unrepeatable. Bypassing here means an
 * `onAuth` answer can never reach a cache key or a cacache file on any path.
 */
export async function readThroughCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?:
    | (NpmCacheOptions & {
        cacheClass?: NpmCacheClass | undefined
        onAuth?: NpmOnAuth | undefined
        token?: string | undefined
      })
    | undefined,
): Promise<T> {
  const opts = { __proto__: null, ...options } as NonNullable<typeof options>
  if (opts.token !== undefined || opts.onAuth !== undefined) {
    return await fetcher()
  }
  const cache = selectNpmCache(opts, opts.cacheClass)
  if (cache === undefined) {
    return await fetcher()
  }
  return await cache.getOrFetch<T>(key, fetcher)
}

/**
 * Pick the cache instance for an endpoint class, falling back to the default.
 */
export function selectNpmCache(
  options: NpmCacheOptions,
  cacheClass?: NpmCacheClass | undefined,
): TtlCache | undefined {
  const opts = { __proto__: null, ...options } as NpmCacheOptions
  if (cacheClass !== undefined) {
    const found = opts.caches?.[cacheClass]
    if (found !== undefined) {
      return found
    }
  }
  return opts.cache
}
