/**
 * @file Pure slicing of a raw npm packument into the client's slim shapes — no
 *   network, no cache. `sliceVersionMeta` handles one version's `dist` /
 *   `_npmUser` fields; `slicePackument` wraps it with the top-level packument
 *   fields (`name`, `distTags`, `time.created` / `time.modified`).
 */

import type {
  PackumentMetaSlim,
  PackumentVersionMetaSlim,
  RawPackument,
  RawPackumentVersion,
} from './meta-types'

/**
 * Slice one raw version entry into its `PackumentVersionMetaSlim` shape.
 *
 * `trustedPublisher` / `staged` are only set when `_npmUser` is present on the
 * entry (i.e. the packument was fetched with `variant: 'full'`) — on the
 * abbreviated variant, trust signals are unknown rather than `false`.
 */
export function sliceOneVersion(
  entry: RawPackumentVersion,
  publishedAt: string | undefined,
): PackumentVersionMetaSlim {
  const dist = entry.dist
  const npmUser = entry._npmUser
  const slim: PackumentVersionMetaSlim = { time: publishedAt ?? '' }
  if (entry.deprecated !== undefined) {
    slim.deprecated = entry.deprecated
  }
  if (entry.engines !== undefined) {
    slim.engines = entry.engines
  }
  if (dist?.integrity !== undefined) {
    slim.integrity = dist.integrity
  }
  if (dist?.shasum !== undefined) {
    slim.shasum = dist.shasum
  }
  if (dist?.tarball !== undefined) {
    slim.tarball = dist.tarball
  }
  if (dist?.attestations !== undefined) {
    slim.attestations = dist.attestations
  }
  if (npmUser !== undefined) {
    slim.trustedPublisher = !!npmUser.trustedPublisher
    slim.staged = !!npmUser.approver
  }
  return slim
}

/**
 * Slice a raw packument into `PackumentMetaSlim` — the top-level fields the
 * client keeps (`name`, `distTags` with a guaranteed `latest` key,
 * `timeCreated` / `timeModified`, `lastSynced`) plus the per-version map from
 * `sliceVersionMeta`.
 */
export function slicePackument(packument: RawPackument): PackumentMetaSlim {
  const rawDistTags = packument['dist-tags'] ?? {}
  return {
    distTags: { latest: rawDistTags['latest'] ?? '', ...rawDistTags },
    lastSynced: Date.now(),
    name: packument.name ?? '',
    timeCreated: packument.time?.['created'],
    timeModified: packument.time?.['modified'],
    versions: sliceVersionMeta(packument),
  }
}

/**
 * Slice every version entry in a raw packument into `PackumentVersionMetaSlim`
 * records, keyed by version string.
 */
export function sliceVersionMeta(
  packument: RawPackument,
): Record<string, PackumentVersionMetaSlim> {
  const rawVersions = packument.versions ?? {}
  const time = packument.time ?? {}
  const result: Record<string, PackumentVersionMetaSlim> = {}
  const versions = Object.keys(rawVersions)
  for (let i = 0, { length } = versions; i < length; i += 1) {
    const version = versions[i]!
    result[version] = sliceOneVersion(rawVersions[version]!, time[version])
  }
  return result
}
