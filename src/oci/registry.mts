/**
 * @file The tie-together layer for an anonymous OCI pull: token → manifest →
 *   blob, in the order the distribution spec requires. `resolveImageManifest`
 *   turns a tag or digest into a concrete single-image manifest, chasing a
 *   multi-arch index down to one platform. `pullFirstLayer` runs the full
 *   anon-pull flow for the common single-artifact, single-layer case and
 *   returns the layer bytes plus its declared digest so the CALLER can verify
 *   `sha256(bytes) === digest`. All network work goes through the same
 *   injectable `{ http }` adapter the leaf modules take.
 */

import { ErrorCtor } from '../primordials/error.mjs'
import { getBlob } from './blob.mjs'
import {
  getManifest,
  isManifestIndex,
  pickPlatformManifestDigest,
} from './manifest.mjs'
import { getRegistryToken } from './registry-token.mjs'

import type {
  OciDescriptor,
  OciHttpOptions,
  OciManifestResult,
  OciPlatform,
} from './types.mjs'

export const GHCR_REGISTRY = 'ghcr.io'

/**
 * Result of an end-to-end single-layer pull: the layer's declared descriptor
 * and its raw bytes for the caller to digest-verify.
 */
export interface OciLayerPull {
  bytes: Uint8Array
  layer: OciDescriptor
}

/**
 * Run the full anonymous pull flow for a single-artifact, single-layer image:
 * acquire a pull token, resolve the manifest by chasing an index down to a
 * platform, and fetch the sole layer's bytes. Throws when the resolved manifest
 * does not carry exactly one layer. The caller verifies `sha256(bytes)` against
 * `layer.digest`.
 */
export async function pullFirstLayer(
  registry: string,
  repository: string,
  reference: string,
  options: OciHttpOptions,
  platform?: OciPlatform | undefined,
): Promise<OciLayerPull> {
  const token = await getRegistryToken(registry, repository, options)
  const resolved = await resolveImageManifest(
    registry,
    repository,
    reference,
    token,
    options,
    platform,
  )
  const layers = resolved.manifest.layers ?? []
  const layer = layers[0]
  if (!layer?.digest) {
    throw new ErrorCtor(
      `Manifest carried no pullable layer.\n` +
        `  Where: /v2/${repository}/manifests/${reference} on ${registry}\n` +
        `  Saw: ${layers.length} layer(s), first has no digest\n` +
        `  Fix: expected a single-artifact image with at least one layer.`,
    )
  }
  const bytes = await getBlob(
    registry,
    repository,
    layer.digest,
    token,
    options,
  )
  return { bytes, layer }
}

/**
 * Resolve a `reference` tag or digest to a concrete single-image manifest.
 * When the reference points at a manifest index, the preferred platform
 * (default `linux/amd64`) is picked and re-fetched so the returned manifest
 * carries a `config` + `layers`. The `digest` is the platform-resolved
 * manifest's `Docker-Content-Digest`.
 */
export async function resolveImageManifest(
  registry: string,
  repository: string,
  reference: string,
  token: string,
  options: OciHttpOptions,
  platform?: OciPlatform | undefined,
): Promise<OciManifestResult> {
  const top = await getManifest(registry, repository, reference, token, options)
  if (!isManifestIndex(top.manifest)) {
    return top
  }
  const platformDigest = pickPlatformManifestDigest(top.manifest, platform)
  if (!platformDigest) {
    throw new ErrorCtor(
      `Manifest index had no platform entry.\n` +
        `  Where: /v2/${repository}/manifests/${reference} on ${registry}\n` +
        `  Saw: empty manifests[]\n` +
        `  Fix: confirm the reference publishes at least one platform.`,
    )
  }
  return getManifest(registry, repository, platformDigest, token, options)
}
