/**
 * @file Browser twin of the cached, batch-capable npm registry metadata
 *   client. Binds the platform-free helper core (`./shared`) to
 *   `../meta-cache/browser`'s `fetch`-backed `getPackumentSlim`, and
 *   re-exports the caching (`../meta-cache/browser`) and slimming
 *   (`../meta-slice`) surfaces so a consumer needs one import.
 *   Mirrors `./node` export for export, plus the two Web Storage helpers
 *   (`createWebStorageAdapter`, `createWebStorageMetaCache`) that only mean
 *   something in a browser. Nothing reachable from here imports a `node:`
 *   builtin, which
 *   `scripts/repo/check/browser-exports-have-no-node-builtins.mts` enforces on
 *   every build.
 *   The default cache is memo-only, by design — see `../meta-cache/browser`
 *   for why a packument cache does not default to `localStorage`, and how to
 *   opt into a durable tier in one line.
 */

import { getPackumentSlim } from '../meta-cache/browser.mjs'
import {
  getBatch as getSharedBatch,
  getLatestVersion as getSharedLatestVersion,
  getPublishDate as getSharedPublishDate,
  getVersions as getSharedVersions,
  getVersionTrustInfo as getSharedVersionTrustInfo,
  safeGetLatestVersion as safeGetSharedLatestVersion,
  safeGetPackumentSlim as safeGetSharedPackumentSlim,
  safeGetPublishDate as safeGetSharedPublishDate,
  safeGetVersions as safeGetSharedVersions,
  safeGetVersionTrustInfo as safeGetSharedVersionTrustInfo,
} from './shared.mjs'

import type {
  BatchOptions,
  BatchResult,
  GetPackumentSlimOptions,
  GetVersionsOptions,
  GetVersionsResult,
  LatestVersionResult,
  PackumentMetaSlim,
  VersionTrustInfo,
} from '../meta-types.mjs'

export {
  buildMetaCacheKey,
  createNpmMetaCache,
  createWebStorageAdapter,
  createWebStorageMetaCache,
  fetchPackumentSlim,
  getDefaultMetaCache,
  getPackumentSlim,
  getStaleMeta,
  PackumentNotFoundError,
  rememberStaleMeta,
} from '../meta-cache/browser.mjs'
export {
  sliceOneVersion,
  slicePackument,
  sliceVersionMeta,
} from '../meta-slice.mjs'
export {
  extractHttpStatus,
  isMatured,
  resolveRequestedVersions,
  toEpochMs,
} from './shared.mjs'
export type {
  CachedPackumentEntry,
  CachedPackumentHit,
  CachedPackumentMiss,
  ResolvedPackumentFetchOptions,
  WebStorageLike,
} from '../meta-cache/browser.mjs'
export type { FetchPackumentSlim } from './shared.mjs'
export type {
  BatchOptions,
  BatchResult,
  GetPackumentSlimOptions,
  GetVersionsOptions,
  GetVersionsResult,
  LatestVersionResult,
  NpmMetaHttpAdapter,
  PackageError,
  PackumentMetaSlim,
  PackumentVariant,
  PackumentVersionMetaSlim,
  RawNpmUser,
  RawPackument,
  RawPackumentVersion,
  RawVersionDist,
  VersionTrustInfo,
} from '../meta-types.mjs'

/**
 * Fetch every name with bounded concurrency, returning an index-preserving
 * array. See `./shared`'s `getBatch` for the `throwOnError` contract.
 */
export async function getBatch(
  names: string[],
  options?: BatchOptions | undefined,
): Promise<BatchResult[]> {
  return await getSharedBatch(getPackumentSlim, names, options)
}

/**
 * Resolve the latest version — `distTags.latest`, or the resolution of
 * `options.range` narrowed to a single version.
 *
 * @throws {PackumentNotFoundError} When `range` resolves to nothing.
 */
export async function getLatestVersion(
  name: string,
  options?: GetVersionsOptions | undefined,
): Promise<LatestVersionResult> {
  return await getSharedLatestVersion(getPackumentSlim, name, options)
}

/**
 * Look up a single version's publish time (ISO string), or `undefined` when
 * the version isn't in the packument.
 */
export async function getPublishDate(
  name: string,
  version: string,
  options?: GetPackumentSlimOptions | undefined,
): Promise<string | undefined> {
  return await getSharedPublishDate(getPackumentSlim, name, version, options)
}

/**
 * List versions, optionally filtered by `range`, an `after` time floor,
 * and/or a `minAgeDays` maturity window.
 *
 * @throws {PackumentNotFoundError} When `range` names an exact version or
 *   dist-tag that isn't present in the packument.
 */
export async function getVersions(
  name: string,
  options?: GetVersionsOptions | undefined,
): Promise<GetVersionsResult> {
  return await getSharedVersions(getPackumentSlim, name, options)
}

/**
 * Per-version trust signals (forces `variant: 'full'`).
 */
export async function getVersionTrustInfo(
  name: string,
  options?: GetPackumentSlimOptions | undefined,
  // oxlint-disable-next-line socket/prefer-refined-record -- open string keys
): Promise<Record<string, VersionTrustInfo>> {
  return await getSharedVersionTrustInfo(getPackumentSlim, name, options)
}

/**
 * Fail-open `getLatestVersion` — `undefined` on any error.
 *
 * @unused No internal or Socket consumers; exercised only by its unit tests.
 */
export async function safeGetLatestVersion(
  name: string,
  options?: GetVersionsOptions | undefined,
): Promise<LatestVersionResult | undefined> {
  return await safeGetSharedLatestVersion(getPackumentSlim, name, options)
}

/**
 * Fail-open `getPackumentSlim` — `undefined` on any error.
 *
 * @unused No internal or Socket consumers; exercised only by its unit tests.
 */
export async function safeGetPackumentSlim(
  name: string,
  options?: GetPackumentSlimOptions | undefined,
): Promise<PackumentMetaSlim | undefined> {
  return await safeGetSharedPackumentSlim(getPackumentSlim, name, options)
}

/**
 * Fail-open `getPublishDate` — `undefined` on any error.
 *
 * @unused No internal or Socket consumers; exercised only by its unit tests.
 */
export async function safeGetPublishDate(
  name: string,
  version: string,
  options?: GetPackumentSlimOptions | undefined,
): Promise<string | undefined> {
  return await safeGetSharedPublishDate(
    getPackumentSlim,
    name,
    version,
    options,
  )
}

/**
 * Fail-open `getVersions` — an empty result on any error.
 *
 * @unused No internal or Socket consumers; exercised only by its unit tests.
 */
export async function safeGetVersions(
  name: string,
  options?: GetVersionsOptions | undefined,
): Promise<GetVersionsResult> {
  return await safeGetSharedVersions(getPackumentSlim, name, options)
}

/**
 * Fail-open `getVersionTrustInfo` — an empty record on any error.
 *
 * @unused No internal or Socket consumers; exercised only by its unit tests.
 */
export async function safeGetVersionTrustInfo(
  name: string,
  options?: GetPackumentSlimOptions | undefined,
  // oxlint-disable-next-line socket/prefer-refined-record -- open string keys
): Promise<Record<string, VersionTrustInfo>> {
  return await safeGetSharedVersionTrustInfo(getPackumentSlim, name, options)
}
