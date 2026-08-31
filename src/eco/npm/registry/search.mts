/**
 * @file The npm registry search endpoint.
 *   Unauthenticated, so it is cacheable, on a short TTL: search is a ranked
 *   view over a corpus that changes continuously and is never correct for
 *   long. See `SEARCH_TTL_MS` in `./cache` for the reasoning.
 *   Pagination here is offset based (`from` and `size`), not the opaque cursor
 *   socket-sdk-js uses for its own paginated routes. `nextSearchFrom` does the
 *   one piece of arithmetic worth centralizing: deciding when to stop.
 *   Walking off the end of a result set is the classic offset-pagination bug,
 *   and it shows up as an infinite loop rather than an error.
 */

import { buildNpmCacheKey, readThroughCache, selectNpmCache } from './cache.mjs'
import { buildQuery, resolveRegistry } from './client.mjs'

import type { NpmCacheOptions } from './cache.mjs'
import type { NpmRegistryHttpOptions } from './client.mjs'

/**
 * The package identity carried by one search hit.
 */
export interface NpmSearchPackage {
  readonly date?: string | undefined
  readonly description?: string | undefined
  readonly keywords?: readonly string[] | undefined
  readonly license?: string | undefined
  readonly links?: Readonly<Record<string, string>> | undefined
  readonly maintainers?:
    | ReadonlyArray<{
        readonly email?: string | undefined
        readonly username?: string | undefined
      }>
    | undefined
  readonly name?: string | undefined
  readonly publisher?:
    | {
        readonly email?: string | undefined
        readonly username?: string | undefined
      }
    | undefined
  readonly sanitized_name?: string | undefined
  readonly version?: string | undefined
}

/**
 * One search result, with the ranking and popularity signals npm attaches.
 */
export interface NpmSearchObject {
  readonly dependents?: number | undefined
  readonly downloads?:
    | {
        readonly monthly?: number | undefined
        readonly weekly?: number | undefined
      }
    | undefined
  readonly flags?: Readonly<Record<string, number>> | undefined
  readonly package?: NpmSearchPackage | undefined
  readonly score?:
    | {
        readonly detail?: Readonly<Record<string, number>> | undefined
        readonly final?: number | undefined
      }
    | undefined
  readonly searchScore?: number | undefined
  readonly updated?: string | undefined
}

/**
 * One page of search results.
 */
export interface NpmSearchRead {
  readonly objects: readonly NpmSearchObject[]
  /**
   * False when the registry could not be asked. Distinct from an empty
   * `objects`, which means it answered and nothing matched.
   */
  readonly reachable: boolean
  readonly time?: string | undefined
  /**
   * How many results exist in total, not how many are on this page.
   */
  readonly total?: number | undefined
}

/**
 * A search request. `from` and `size` are the offset window; npm applies its
 * own defaults when they are omitted.
 */
export interface NpmSearchParams {
  from?: number | undefined
  size?: number | undefined
  text: string
}

/**
 * The `from` offset for the next page, or undefined when there is none.
 *
 * Answers undefined on an unreachable read as well as on the last page. A
 * failed page tells us nothing about whether more results exist, and treating
 * it as "keep going" turns one network blip into an endless paging loop.
 */
export function nextSearchFrom(
  params: NpmSearchParams,
  read: NpmSearchRead,
): number | undefined {
  if (!read.reachable || read.total === undefined) {
    return undefined
  }
  const from = params.from ?? 0
  const consumed = from + read.objects.length
  // No progress means the registry returned an empty page while claiming more
  // results exist. Advancing anyway would re-request the same offset forever.
  if (read.objects.length === 0 || consumed >= read.total) {
    return undefined
  }
  return consumed
}

/**
 * Search the registry for packages.
 *
 * Cached for `SEARCH_TTL_MS` when the caller supplied a cache. The cache key
 * covers the registry and all three query parameters, so a different page or a
 * different page size is a different entry rather than a wrong hit.
 */
export async function searchPackages(
  params: NpmSearchParams,
  options: NpmRegistryHttpOptions &
    NpmCacheOptions & { registry?: string | undefined },
): Promise<NpmSearchRead> {
  const opts = { __proto__: null, ...options } as typeof options
  const registry = resolveRegistry(opts.registry)
  const query = buildQuery({
    from: params.from,
    size: params.size,
    text: params.text,
  })
  const url = `${registry}/-/v1/search${query}`
  const key = buildNpmCacheKey(registry, 'search', [
    params.text,
    params.size,
    params.from,
  ])
  const fetcher = async (): Promise<NpmSearchRead> => {
    try {
      const json = await opts.http.json<{
        objects?: NpmSearchObject[] | undefined
        time?: string | undefined
        total?: number | undefined
      }>(url)
      return {
        objects: Array.isArray(json.objects) ? json.objects : [],
        reachable: true,
        time: json.time,
        total: json.total,
      }
    } catch {
      return { objects: [], reachable: false }
    }
  }
  const read = await readThroughCache(key, fetcher, {
    cache: selectNpmCache(opts, 'search'),
    cacheClass: 'search',
  })
  // Never let a failed read occupy the entry for a full TTL; the registry may
  // already be back by the time the next caller asks.
  if (!read.reachable) {
    await selectNpmCache(opts, 'search')?.delete(key)
  }
  return read
}
