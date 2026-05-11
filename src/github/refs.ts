/**
 * @fileoverview Resolve GitHub git refs (tag / branch / commit) to
 * full commit SHAs.
 *
 * Two-tier strategy with cross-backend fallback:
 *
 *   1. REST cascade (`fetchRefSha`): tag → branch → commit. The
 *      first 200 OK wins.
 *   2. GraphQL fallback (`fetchRefShaViaGraphQL`): fires only when
 *      the REST cascade hits the documented 200-OK-empty-body
 *      incident shape. GraphQL queries hit a different backend at
 *      GitHub, so it stays consistent through Elasticsearch outages
 *      that produce empty REST bodies.
 *
 * Caching: a `TtlCache` keyed by `${owner}/${repo}@${ref}` with a
 * 5-minute TTL plus in-memory memoization. `clearRefCache()` clears
 * the in-memory tier; the persistent disk tier survives so the cache
 * warms quickly on the next run. Disable everything with the
 * `DISABLE_GITHUB_CACHE` env var.
 *
 * Module shape: this file holds the public `resolveRefToSha` entry
 * point. Supporting surface lives in sibling leaves and is re-exported
 * here so existing `github/refs` importers keep working unchanged:
 *
 *   - REST tier cascade — `./refs-rest`
 *   - GraphQL fallback — `./refs-graphql`
 *   - TtlCache singleton + clearRefCache — `./refs-cache`
 */

import process from 'node:process'

import { fetchRefSha } from './refs-rest'
import { getGithubCache } from './refs-cache'

import type { ResolveRefOptions } from './types'

/**
 * Resolve a git ref (tag, branch, or commit SHA) to its full commit SHA.
 * Handles tags (annotated and lightweight), branches, and commit SHAs.
 * Results are cached in-memory and on disk (with TTL) to minimize API calls.
 *
 * Resolution strategy:
 * 1. Try as a tag (refs/tags/{ref})
 * 2. If tag is annotated, dereference to get the commit SHA
 * 3. If not a tag, try as a branch (refs/heads/{ref})
 * 4. If not a branch, try as a commit SHA directly
 *
 * Caching behavior:
 * - In-memory cache (Map) for immediate lookups
 * - Persistent disk cache (cacache) for durability across runs
 * - Default TTL: 5 minutes
 * - Disable caching with `DISABLE_GITHUB_CACHE` env var
 *
 * @param owner - Repository owner (user or organization name)
 * @param repo - Repository name
 * @param ref - Git reference to resolve (tag name, branch name, or commit SHA)
 * @param options - Resolution options including authentication token
 * @returns The full commit SHA (40-character hex string)
 *
 * @throws {Error} When ref cannot be resolved after trying all strategies
 * @throws {GitHubRateLimitError} When API rate limit is exceeded
 *
 * @example
 * ```ts
 * // Resolve a tag to commit SHA
 * const sha = await resolveRefToSha('owner', 'repo', 'v1.0.0')
 * console.log(sha) // 'a1b2c3d4e5f6...'
 * ```
 *
 * @example
 * ```ts
 * // Resolve a branch to latest commit SHA
 * const sha = await resolveRefToSha('owner', 'repo', 'main')
 * console.log(sha) // Latest commit on main branch
 * ```
 *
 * @example
 * ```ts
 * // Resolve with custom token
 * const sha = await resolveRefToSha(
 *   'owner',
 *   'repo',
 *   'develop',
 *   { token: 'ghp_customtoken' }
 * )
 * ```
 *
 * @example
 * ```ts
 * // Commit SHA passes through unchanged (but validates it exists)
 * const sha = await resolveRefToSha('owner', 'repo', 'a1b2c3d4')
 * console.log(sha) // Full 40-char SHA
 * ```
 */
export async function resolveRefToSha(
  owner: string,
  repo: string,
  ref: string,
  options?: ResolveRefOptions | undefined,
): Promise<string> {
  const opts = {
    __proto__: null,
    ...options,
  } as ResolveRefOptions

  const cacheKey = `${owner}/${repo}@${ref}`

  // Optionally disable cache.
  if (process.env['DISABLE_GITHUB_CACHE']) {
    return await fetchRefSha(owner, repo, ref, opts)
  }

  // Use TTL cache for persistent storage and in-memory memoization.
  const cache = getGithubCache()
  return await cache.getOrFetch(cacheKey, async () => {
    return await fetchRefSha(owner, repo, ref, opts)
  })
}

// Re-exports — preserve the historical `github/refs` surface so
// downstream importers don't have to chase the split.
export { clearRefCache, getGithubCache } from './refs-cache'
export { fetchRefShaViaGraphQL } from './refs-graphql'
export { fetchRefSha } from './refs-rest'
