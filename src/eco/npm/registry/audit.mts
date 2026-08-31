/**
 * @file The npm registry bulk audit endpoint: advisories for a set of packages
 *   and versions in one round trip.
 *   It is a POST, but it is a READ. Nothing changes on the registry, the
 *   answer depends only on the body, and callers use it the way they use any
 *   other lookup. So it gets the fail-open read contract and, unlike the
 *   authenticated surface, it gets a cache: npm documents no authorization for
 *   this route, so the answer is not scoped to a caller and one caller's copy
 *   is safe to hand to the next.
 *   Fail-open matters more here than almost anywhere else in this client. An
 *   empty advisory map means "these versions are clean", and a caller acting
 *   on that ships a release. A request that never completed must not be able
 *   to produce that sentence, so it produces `reachable: false` instead.
 */

import { arrayToSorted } from '../../../polyfills/array.mjs'
import { buildNpmCacheKey, readThroughCache, selectNpmCache } from './cache.mjs'
import { npmAuthHeaders, resolveRegistry } from './client.mjs'

import type { NpmCacheOptions } from './cache.mjs'
import type { NpmAuthOptions, NpmRegistryHttpOptions } from './client.mjs'

/**
 * One advisory as npm reports it in a bulk audit reply.
 */
export interface NpmAdvisory {
  readonly cvss?:
    | {
        readonly score?: number | undefined
        readonly vectorString?: string | undefined
      }
    | undefined
  readonly cwe?: readonly string[] | undefined
  readonly id?: number | undefined
  readonly severity?: string | undefined
  readonly title?: string | undefined
  readonly url?: string | undefined
  /**
   * The semver range the advisory applies to. Wire name
   * `vulnerable_versions`.
   */
  readonly vulnerable_versions?: string | undefined
}

/**
 * The request body: package name to the exact versions being asked about.
 */
export type NpmAdvisoryQuery = Readonly<Record<string, readonly string[]>>

/**
 * A bulk audit answer. Packages with no advisories are simply absent from
 * `advisories`, so an empty map with `reachable: true` genuinely means clean.
 */
export interface NpmBulkAdvisoryRead {
  readonly advisories: Readonly<Record<string, readonly NpmAdvisory[]>>
  /**
   * False when the registry could not be asked. Never conflate this with an
   * empty `advisories`, which is the "no known vulnerabilities" answer.
   */
  readonly reachable: boolean
}

/**
 * A stable string for an advisory query, used as the cache key body.
 *
 * Both the package names and each package's versions are sorted, so two
 * callers asking the same question in a different order share one cache entry
 * instead of each paying for their own.
 */
export function buildAdvisoryQueryKey(query: NpmAdvisoryQuery): string {
  const names = arrayToSorted(Object.keys(query))
  return names
    .map(name => `${name}@${arrayToSorted(query[name] ?? []).join(',')}`)
    .join(';')
}

/**
 * Advisories for a set of packages and versions.
 *
 * Cached for `ADVISORY_TTL_MS` when the caller supplied a cache and no token.
 * Passing a token switches caching off, because a token-scoped answer must
 * never be served to a different caller. See `readThroughCache`.
 */
export async function fetchBulkAdvisories(
  query: NpmAdvisoryQuery,
  options: NpmRegistryHttpOptions &
    NpmCacheOptions &
    Partial<NpmAuthOptions> & { registry?: string | undefined },
): Promise<NpmBulkAdvisoryRead> {
  const opts = { __proto__: null, ...options } as typeof options
  const registry = resolveRegistry(opts.registry)
  const url = `${registry}/-/npm/v1/security/advisories/bulk`
  const key = buildNpmCacheKey(registry, 'advisories-bulk', [
    buildAdvisoryQueryKey(query),
  ])
  const fetcher = async (): Promise<NpmBulkAdvisoryRead> => {
    try {
      const json = await opts.http.json<
        Record<string, NpmAdvisory[]> | undefined
      >(url, {
        body: JSON.stringify(query),
        headers: {
          'content-type': 'application/json',
          ...(opts.token === undefined
            ? {}
            : npmAuthHeaders({ ...opts, token: opts.token })),
        },
        method: 'POST',
      })
      return {
        advisories: typeof json === 'object' && json !== null ? json : {},
        reachable: true,
      }
    } catch {
      return { advisories: {}, reachable: false }
    }
  }
  const read = await readThroughCache(key, fetcher, {
    cache: selectNpmCache(opts, 'advisory'),
    cacheClass: 'advisory',
    ...(opts.token === undefined ? {} : { token: opts.token }),
  })
  // A failed read must never be cached: the next caller would inherit an
  // "unreachable" verdict for the whole TTL even after the registry recovered.
  if (!read.reachable) {
    await selectNpmCache(opts, 'advisory')?.delete(key)
  }
  return read
}
