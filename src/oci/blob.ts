/**
 * @file Fetch a blob, a layer or the config, by digest. `GET
 *   /v2/<repository>/blobs/<digest>` with a bearer token. `getBlob` returns the
 *   raw bytes as a `Uint8Array` — the CALLER is responsible for verifying
 *   `sha256(bytes) === digest`. `getBlobJson` is a convenience for the config
 *   blob (and any JSON layer), reusing the injectable adapter's `json`.
 */

import { ErrorCtor } from '../primordials/error'

import type { OciHttpOptions } from './types'

/**
 * Build the blob URL for a repository digest.
 */
export function buildBlobUrl(
  registry: string,
  repository: string,
  digest: string,
): string {
  return `https://${registry}/v2/${repository}/blobs/${digest}`
}

/**
 * Fetch a blob's raw bytes by digest. The caller verifies the content digest
 * against `digest`. Fails loud on a non-2xx response.
 */
export async function getBlob(
  registry: string,
  repository: string,
  digest: string,
  token: string,
  options: OciHttpOptions,
): Promise<Uint8Array> {
  const opts = { __proto__: null, ...options } as OciHttpOptions
  const headers: Record<string, string> = {}
  if (token) {
    headers['authorization'] = `Bearer ${token}`
  }
  const url = buildBlobUrl(registry, repository, digest)
  const res = await opts.http.request(url, { headers })
  if (!res.ok) {
    throw new ErrorCtor(
      `Blob fetch failed.\n` +
        `  Where: /v2/${repository}/blobs/${digest} on ${registry}\n` +
        `  Saw: HTTP ${res.status} ${res.statusText}\n` +
        `  Fix: confirm the digest is referenced by the manifest and the ` +
        `pull token is valid.`,
    )
  }
  return new Uint8Array(res.arrayBuffer())
}

/**
 * Fetch and parse a JSON blob by digest, the image config, typically. Uses the
 * adapter's `json` leg so a non-2xx surfaces through its error path.
 */
export async function getBlobJson<T = unknown>(
  registry: string,
  repository: string,
  digest: string,
  token: string,
  options: OciHttpOptions,
): Promise<T> {
  const opts = { __proto__: null, ...options } as OciHttpOptions
  const headers: Record<string, string> = { accept: 'application/json' }
  if (token) {
    headers['authorization'] = `Bearer ${token}`
  }
  const url = buildBlobUrl(registry, repository, digest)
  return opts.http.json<T>(url, { headers })
}
