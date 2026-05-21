/**
 * @file TtlCache singleton for github/refs. Split out of `github/refs.ts` for
 *   size hygiene. Owns the lazy `_githubCache` slot, the accessor
 *   (`getGithubCache`), and the in-memory-only clear (`clearRefCache`). Caching
 *   strategy:
 *
 *   - In-memory cache (Map) for immediate lookups
 *   - Persistent disk cache (cacache) for durability across runs
 *   - Default TTL: 5 minutes
 *   - Disable everything with the `DISABLE_GITHUB_CACHE` env var
 */

import { createTtlCache } from '../cache/ttl/store'

import { DEFAULT_CACHE_TTL_MS } from './constants'

import type { TtlCache } from '../cache/ttl/types'

let _githubCache: TtlCache | undefined

/**
 * Clear the ref resolution cache (in-memory only). Clears the in-memory
 * memoization cache without affecting the persistent disk cache. Useful for
 * testing or when you need fresh data from the API.
 *
 * Note: This only clears the in-memory cache. The persistent cacache storage
 * remains intact and will be used to rebuild the in-memory cache on next
 * access.
 *
 * @example
 *   ;```ts
 *   // Clear cache to force fresh API calls
 *   await clearRefCache()
 *   const sha = await resolveRefToSha('owner', 'repo', 'main')
 *   // This will hit the persistent cache or API, not in-memory cache
 *   ```
 *
 * @returns Promise that resolves when cache is cleared
 */
export async function clearRefCache(): Promise<void> {
  if (_githubCache) {
    await _githubCache.clear({ memoOnly: true })
  }
}

/**
 * Get or create the GitHub cache instance. Lazy initializes the cache with
 * default TTL and memoization enabled. Used internally for caching GitHub API
 * responses.
 *
 * @returns The singleton cache instance
 */
export function getGithubCache(): TtlCache {
  if (_githubCache === undefined) {
    _githubCache = createTtlCache({
      memoize: true,
      prefix: 'github-refs',
      ttl: DEFAULT_CACHE_TTL_MS,
    })
  }
  return _githubCache
}
