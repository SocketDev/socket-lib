/**
 * @file The staged-tarball read: `GET /-/stage/{stage-id}/tarball`.
 *   Every other endpoint in this client answers JSON. This one answers
 *   `application/octet-stream`, and that difference is the whole reason the
 *   module exists. A gzipped tar is not text. Running those bytes through a
 *   UTF-8 decoder does not fail, it SUBSTITUTES: every sequence that is not
 *   valid UTF-8 becomes U+FFFD, so the caller receives a string that looks
 *   fine, converts back to a shorter and different byte run, and fails to
 *   gunzip for a reason nothing in the error explains. So the injected adapter
 *   carries a `bytes` method and this read uses it.
 *   Why a maintainer wants these bytes: a staged item reports a `shasum`, and
 *   the only way to know that digest describes the artifact you meant to stage
 *   is to hold the artifact. `./tarball` takes what this returns and
 *   extracts or inspects it.
 *   FAIL-OPEN, matching the sibling reads in `./stage`. A 404 answers
 *   `reachable: true` with no bytes, because npm returns 404 both for "no such
 *   stage id" and for "not yours to see". Anything else answers
 *   `reachable: false`, so an unreachable registry can never be read as an
 *   empty tarball.
 *   Browser-safe: no `node:*` builtin here. The Node-only extraction helpers
 *   are in `./tarball`.
 */

import { npmAuthHeaders, resolveRegistry } from './client.mjs'
import { httpErrorStatus } from './live.mjs'

import type { NpmAuthOptions, NpmRegistryHttpOptions } from './client.mjs'

/**
 * A staged tarball read, or the fact that it could not be read.
 */
export interface NpmStagedTarballRead {
  /**
   * The raw tarball bytes, exactly as the registry sent them: a gzipped tar.
   * Absent on a reachable 404, and absent whenever `reachable` is false.
   */
  readonly bytes?: Uint8Array | undefined
  /**
   * False when the registry could not be asked. A reachable read with no
   * `bytes` means npm answered 404: no such staged version, or none this token
   * may see.
   */
  readonly reachable: boolean
}

/**
 * A prepared request for the binary endpoint: the URL and the headers to send
 * with it.
 */
export interface NpmTarballRequest {
  readonly headers: Record<string, string>
  readonly url: string
}

/**
 * Download a staged version's tarball as raw bytes.
 *
 * The reply is a gzipped tar, the same bytes `npm pack` would have produced,
 * and they are returned undecoded. Hand them to `extractNpmTarball` or
 * `readNpmTarballManifest` in `./tarball` to look inside.
 *
 * No OTP is involved: npm documents this route as authenticated by a bearer
 * token alone, unlike the staging delete and approve routes.
 */
export async function fetchStagedTarball(
  stageId: string,
  options: NpmRegistryHttpOptions & NpmAuthOptions,
): Promise<NpmStagedTarballRead> {
  const opts = { __proto__: null, ...options } as typeof options
  const request = stagedTarballUrl(stageId, opts)
  try {
    const bytes = await opts.http.bytes(request.url, {
      headers: request.headers,
      method: 'GET',
    })
    return { bytes, reachable: true }
  } catch (e) {
    if (httpErrorStatus(e) === 404) {
      return { bytes: undefined, reachable: true }
    }
    return { reachable: false }
  }
}

/**
 * The URL and headers for downloading a staged version's tarball.
 *
 * Pure, so a test can assert the exact request with no network, and so a
 * caller that already owns a downloader — a streaming one, or a browser
 * `fetch` writing straight to disk — can drive the endpoint itself rather than
 * buffering the whole archive through `fetchStagedTarball`.
 */
export function stagedTarballUrl(
  stageId: string,
  options: NpmAuthOptions,
): NpmTarballRequest {
  const opts = { __proto__: null, ...options } as NpmAuthOptions
  const registry = resolveRegistry(opts.registry)
  return {
    headers: {
      ...npmAuthHeaders(opts),
      accept: 'application/octet-stream',
    },
    url: `${registry}/-/stage/${encodeURIComponent(stageId)}/tarball`,
  }
}
