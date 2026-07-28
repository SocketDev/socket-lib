/**
 * @file Fetch and parse an OCI/Docker image manifest. `getManifest` issues
 *   `GET /v2/<repository>/manifests/<reference>` with a bearer token and an
 *   `Accept` set covering BOTH the OCI (`application/vnd.oci.image.manifest.
 *   v1+json`, index `...image.index.v1+json`) and Docker v2
 *   (`...distribution.manifest.v2+json`, list `...manifest.list.v2+json`) media
 *   types, returning the parsed body plus its canonical
 *   `Docker-Content-Digest`. Pure helpers (`parseManifest`, `isManifestIndex`,
 *   `pickPlatformManifestDigest`) carry the multi-arch logic so a manifest
 *   index can be resolved to a concrete platform manifest; single-artifact
 *   (one-layer) pulls stay simple.
 */

import { ErrorCtor } from '../primordials/error'
import { firstHeaderValue } from './registry-token'

import type {
  OciDescriptor,
  OciHttpOptions,
  OciManifest,
  OciManifestResult,
  OciPlatform,
} from './types'

export const OCI_MANIFEST_MEDIA_TYPE =
  'application/vnd.oci.image.manifest.v1+json'
export const OCI_INDEX_MEDIA_TYPE = 'application/vnd.oci.image.index.v1+json'
export const DOCKER_MANIFEST_MEDIA_TYPE =
  'application/vnd.docker.distribution.manifest.v2+json'
export const DOCKER_MANIFEST_LIST_MEDIA_TYPE =
  'application/vnd.docker.distribution.manifest.list.v2+json'

/**
 * The `Accept` header offered on a manifest GET, covering single manifests and
 * multi-arch indexes in both the OCI and Docker v2 media-type families.
 */
export const MANIFEST_ACCEPT = [
  OCI_MANIFEST_MEDIA_TYPE,
  OCI_INDEX_MEDIA_TYPE,
  DOCKER_MANIFEST_MEDIA_TYPE,
  DOCKER_MANIFEST_LIST_MEDIA_TYPE,
].join(', ')

/**
 * Build the manifest URL for a repository reference, either a tag or a digest.
 */
export function buildManifestUrl(
  registry: string,
  repository: string,
  reference: string,
): string {
  return `https://${registry}/v2/${repository}/manifests/${reference}`
}

/**
 * Fetch one manifest by tag or digest reference. Returns the parsed manifest,
 * its canonical `Docker-Content-Digest` that a caller pins, and the served
 * media type. Fails loud on a non-2xx response or an unparseable body.
 */
export async function getManifest(
  registry: string,
  repository: string,
  reference: string,
  token: string,
  options: OciHttpOptions,
): Promise<OciManifestResult> {
  const opts = { __proto__: null, ...options } as OciHttpOptions
  const headers: Record<string, string> = { accept: MANIFEST_ACCEPT }
  if (token) {
    headers['authorization'] = `Bearer ${token}`
  }
  const url = buildManifestUrl(registry, repository, reference)
  const res = await opts.http.request(url, { headers })
  if (!res.ok) {
    throw new ErrorCtor(
      `Manifest fetch failed.\n` +
        `  Where: /v2/${repository}/manifests/${reference} on ${registry}\n` +
        `  Saw: HTTP ${res.status} ${res.statusText}\n` +
        `  Fix: confirm the reference exists and the pull token is valid.`,
    )
  }
  const manifest = parseManifest(res.json())
  if (!manifest) {
    throw new ErrorCtor(
      `Manifest body was not a JSON object.\n` +
        `  Where: /v2/${repository}/manifests/${reference} on ${registry}\n` +
        `  Saw: non-object response body\n` +
        `  Fix: expected an OCI or Docker v2 image manifest.`,
    )
  }
  const digest = firstHeaderValue(res.headers['docker-content-digest']) ?? ''
  const mediaType =
    firstHeaderValue(res.headers['content-type']) ?? manifest.mediaType
  return { digest, manifest, mediaType }
}

/**
 * Return `true` when a manifest body is a multi-arch index / list rather than a
 * single image manifest.
 */
export function isManifestIndex(manifest: OciManifest): boolean {
  return Array.isArray(manifest.manifests) && manifest.manifests.length > 0
}

/**
 * Parse a raw manifest JSON response into a typed `OciManifest`. Returns
 * `undefined` when the input is not an object.
 */
export function parseManifest(raw: unknown): OciManifest | undefined {
  if (raw === undefined || raw === null || typeof raw !== 'object') {
    return undefined
  }
  const rec = raw as {
    config?: OciDescriptor | undefined
    layers?: OciDescriptor[] | undefined
    manifests?: OciDescriptor[] | undefined
    mediaType?: string | undefined
    schemaVersion?: number | undefined
  }
  return {
    config: rec.config,
    layers: Array.isArray(rec.layers) ? rec.layers : undefined,
    manifests: Array.isArray(rec.manifests) ? rec.manifests : undefined,
    mediaType: rec.mediaType,
    schemaVersion: rec.schemaVersion,
  }
}

/**
 * Choose a concrete platform manifest digest from an index. Prefers an explicit
 * `platform` match (default `linux/amd64`), then any real (non-`unknown`)
 * platform, then the first entry. Returns `undefined` for an empty index.
 */
export function pickPlatformManifestDigest(
  manifest: OciManifest,
  platform?: OciPlatform | undefined,
): string | undefined {
  const entries = manifest.manifests ?? []
  const wantOs = platform?.os ?? 'linux'
  const wantArch = platform?.architecture ?? 'amd64'
  const exact = entries.find(
    m =>
      m.platform?.os === wantOs &&
      m.platform?.architecture === wantArch &&
      (platform?.variant === undefined ||
        m.platform?.variant === platform.variant),
  )
  const real = entries.find(m => m.platform?.os && m.platform.os !== 'unknown')
  return (exact ?? real ?? entries[0])?.digest
}
