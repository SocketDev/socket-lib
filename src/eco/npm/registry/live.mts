/**
 * @file Live (CDN-cache-defeating) npm registry reads — the cache-busted
 *   packument fetch, the checked latest-version read, and the maintainer-list
 *   read. Sits beside `./index` (which owns the pure parsers and plain
 *   packument reads) so both stay under the file-size cap. Browser-safe: the
 *   HTTP adapter is injected by the caller, and every adapter method accepts an
 *   optional init carrying request headers — the cache-busting reads are
 *   pointless if the no-cache headers never reach the wire. Node callers pass
 *   `{ bytes: httpBytes, json: httpJson }` from
 *   `@socketsecurity/lib/http-request`; browser callers pass the
 *   `http-request/browser` twin. The adapter type is `NpmHttpOptions` from
 *   `./index`, which is the one definition of that method set for the whole
 *   directory.
 */

import { arrayToSorted } from '../../../polyfills/array.mjs'
import { encodeRegistryName } from './index.mjs'

import type { NpmHttpOptions } from './index.mjs'

const NPM_REGISTRY = 'https://registry.npmjs.org'

export interface CacheBustedRead {
  headers: Record<string, string>
  url: string
}

/**
 * A cache-busting registry read: the packument URL with a unique `_cb` nonce
 * query param appended, plus no-cache request headers layered over `accept`.
 *
 * WHY: the npm registry serves packuments through a CDN that caches them for
 * MINUTES. A release gate that trusts a cached read can see a version that is
 * already LIVE on the registry as ABSENT — or read a stale `dist-tags.latest`
 * — and mis-decide. A unique query param defeats the CDN cache key;
 * `Cache-Control: no-cache` + `Pragma: no-cache` defeat any intermediary
 * proxy. Pure — `nonce` is injectable so a test can assert the exact busting
 * applied.
 */
export function cacheBustedRead(
  url: string,
  accept: string,
  nonce: string = globalThis.crypto.randomUUID(),
): CacheBustedRead {
  const separator = url.includes('?') ? '&' : '?'
  return {
    headers: {
      accept,
      'cache-control': 'no-cache',
      pragma: 'no-cache',
    },
    url: `${url}${separator}_cb=${nonce}`,
  }
}

/**
 * The registry `dist-tags.latest` for a package, distinguishing "the registry
 * answered: never published" (a 404 — `reachable: true, latest: undefined`)
 * from "the registry could not be consulted" (network failure, timeout, 5xx —
 * `reachable: false`). Reads the abbreviated packument through
 * `cacheBustedRead` so a CDN-cached copy can never mis-report a live version
 * as absent. `nonce` is injectable for tests.
 */
export async function fetchLatestPublishedVersionChecked(
  name: string,
  options: NpmHttpOptions & { nonce?: string | undefined },
): Promise<RegistryLatestRead> {
  const opts = { __proto__: null, ...options } as typeof options
  const read = cacheBustedRead(
    `${NPM_REGISTRY}/${encodeRegistryName(name)}`,
    'application/vnd.npm.install-v1+json',
    opts.nonce,
  )
  try {
    const json = await opts.http.json<{
      'dist-tags'?: { latest?: string | undefined } | undefined
    }>(read.url, { headers: read.headers })
    return { latest: json['dist-tags']?.latest, reachable: true }
  } catch (e) {
    if (httpErrorStatus(e) === 404) {
      return { latest: undefined, reachable: true }
    }
    return { reachable: false }
  }
}

/**
 * A published package's maintainer usernames from the full packument, sorted.
 * `undefined` means the name is not published (a 404). Any other failure —
 * network, 5xx — propagates: an unreadable maintainer list must never read as
 * an empty one, so callers gating on membership fail closed. `nonce` is
 * injectable for tests.
 */
export async function getMaintainers(
  name: string,
  options: NpmHttpOptions & { nonce?: string | undefined },
): Promise<string[] | undefined> {
  const opts = { __proto__: null, ...options } as typeof options
  const read = cacheBustedRead(
    `${NPM_REGISTRY}/${encodeRegistryName(name)}`,
    'application/json',
    opts.nonce,
  )
  try {
    const json = await opts.http.json<{
      maintainers?: Array<{ name?: string | undefined }> | undefined
    }>(read.url, { headers: read.headers })
    const names = (json.maintainers ?? [])
      .map(m => m.name)
      .filter((n): n is string => typeof n === 'string' && n.length > 0)
    return arrayToSorted(names)
  } catch (e) {
    if (httpErrorStatus(e) === 404) {
      return undefined
    }
    throw e
  }
}

/**
 * A registry latest-version read that distinguishes "the registry answered:
 * never published" from "the registry could not be consulted". Callers that
 * derive anything from the released base hard-stop on `reachable: false` —
 * offline, a stale local view would silently widen the derived range.
 */
export type RegistryLatestRead =
  | { latest: string | undefined; reachable: true }
  | { reachable: false }

/**
 * The HTTP status carried by a thrown adapter error, or undefined for a
 * network-level failure. Structural on purpose: this module is browser-safe
 * and cannot import the Node `HttpResponseError` class, but both the Node and
 * browser `http-request` errors carry `response.status`, and fetch-style
 * adapters may throw errors carrying a bare `status`.
 */
export function httpErrorStatus(e: unknown): number | undefined {
  if (e === null || typeof e !== 'object') {
    return undefined
  }
  const { response, status } = e as {
    response?: { status?: unknown | undefined } | undefined
    status?: unknown | undefined
  }
  if (typeof response?.status === 'number') {
    return response.status
  }
  return typeof status === 'number' ? status : undefined
}
