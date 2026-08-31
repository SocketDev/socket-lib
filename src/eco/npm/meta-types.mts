/**
 * @file Type surface for the npm metadata client (`./meta`, `./meta-cache`,
 *   `./meta-slice`) — the raw packument shapes accepted from the registry, the
 *   slimmed shapes the client returns, and the options/result records for the
 *   derived helpers (`getVersions`, `getLatestVersion`, `getBatch`, …). Pure
 *   types, no runtime side effects.
 */

import type { TtlCache } from '../../cache/ttl/types.mjs'
import type { NpmHttpAdapter } from './registry/index.mjs'

/**
 * Per-name/per-batch failure shape returned by `getBatch` in place of a
 * `PackumentMetaSlim` entry when a fetch fails and `throwOnError` is `false`.
 */
export interface PackageError {
  error: string
  name: string
  status?: number | undefined
}

/**
 * Options for `getBatch`. Extends the single-package fetch options — every
 * name in the batch shares the same registry/variant/cache/http adapter.
 */
export interface BatchOptions extends GetPackumentSlimOptions {
  /**
   * Number of packages fetched concurrently.
   *
   * @default 8
   */
  concurrency?: number | undefined
  /**
   * When `true`, every item is still attempted (nothing is aborted
   * in-flight), but once every item has settled, the error from the
   * LOWEST-INDEX failed item is thrown — deterministic regardless of settle
   * order. When `false` (default), failures are captured as `PackageError`
   * entries at their original index.
   *
   * @default false
   */
  throwOnError?: boolean | undefined
}

/**
 * Index-preserving element of `getBatch`'s return array — either the slimmed
 * packument or a `PackageError` for that name.
 */
export type BatchResult = PackageError | PackumentMetaSlim

/**
 * Options shared by every `getPackumentSlim`-backed helper.
 */
export interface GetPackumentSlimOptions {
  /**
   * Cache instance backing the fetch. Defaults to the resolved twin's
   * lazily-created module singleton (`prefix: 'npm-meta'`, 15-minute TTL):
   * cacache-backed on Node, memory-only in the browser. Pass a dedicated
   * instance (`createNpmMetaCache`) for test isolation, a non-default TTL, or
   * — in the browser — a persistent `storage` adapter.
   */
  cache?: TtlCache | undefined
  /**
   * Bypass a cached entry and refetch — unless the entry is younger than 30
   * seconds, in which case the cached value is still served (coalesces bursts
   * of forced refreshes into one upstream fetch).
   *
   * @default false
   */
  force?: boolean | undefined
  /**
   * Injectable HTTP adapter, the `json` half of `NpmHttpAdapter` from
   * `./registry`. Defaults to the resolved twin's `httpJson` — the Node HTTP
   * stack from `../http-request/node`, or `fetch` from
   * `../http-request/browser`.
   */
  http?: NpmMetaHttpAdapter | undefined
  /**
   * Registry base URL.
   *
   * @default 'https://registry.npmjs.org'
   */
  registry?: string | undefined
  /**
   * Forwarded to the HTTP adapter.
   */
  retries?: number | undefined
  /**
   * Forwarded to the HTTP adapter.
   */
  timeout?: number | undefined
  /**
   * `'abbreviated'` (default) omits `_npmUser` trust signals and most
   * metadata — cheap, used for version listing. `'full'` is required to read
   * `trustedPublisher` / `staged` / `integrity` / `shasum`.
   *
   * @default 'abbreviated'
   */
  variant?: PackumentVariant | undefined
}

/**
 * Options for `getVersions` / `getLatestVersion` — semver filtering layered on
 * top of the base fetch options.
 */
export interface GetVersionsOptions extends GetPackumentSlimOptions {
  /**
   * Time floor — only versions published at or after this instant are kept
   * (inclusive). Accepts an ISO 8601 string OR a numeric epoch (a `number` or
   * a numeric string matching `/^\d+$/`) — a string is treated as an epoch
   * ONLY when it is entirely digits; anything else is parsed as an ISO 8601
   * date, so a date string is never misread as an epoch. Throws `RangeError`
   * (via `toEpochMs`) when the value is neither. A version with no recorded
   * publish time is EXCLUDED rather than included by default: it cannot be
   * proven to satisfy the floor, and for a time-based filter unfairly
   * dropping a version is a safer failure mode than unfairly keeping one.
   */
  after?: string | number | undefined
  /**
   * Whether `range` may match a prerelease version (`2.0.0-beta.0`) even when
   * the range itself has no prerelease component. Passed explicitly to every
   * semver call this module makes — never left to the vendored semver's
   * implicit default.
   *
   * @default false
   */
  includePrerelease?: boolean | undefined
  /**
   * Loose semver parsing for `range`.
   *
   * @default false
   */
  loose?: boolean | undefined
  /**
   * Maturity filter in days — only versions whose publish time is at least
   * this many days old are kept. The publish time is anchored to the END of
   * its UTC day before `minAgeDays` is added, matching Socket soak-window
   * semantics, so a version published at any point during a UTC day matures
   * at the same wall-clock instant. Like `after`, a version with no recorded
   * publish time is excluded.
   */
  minAgeDays?: number | undefined
  /**
   * A semver range, an exact version, or a dist-tag name — resolved in that
   * priority order against the packument (npm forbids a dist-tag name that is
   * also valid semver, so the three never collide):
   *
   * 1. A dist-tag key (e.g. `"beta"`) resolves to the single version it points to.
   *    Throws `PackumentNotFoundError` if that version is missing from the
   *    packument, which means the packument is stale or inconsistent.
   * 2. An exact, valid semver version resolves to itself. Throws
   *    `PackumentNotFoundError` if it isn't in the packument — `getVersions`
   *    never falls back to the full list on a specific miss.
   * 3. Anything else is treated as a semver range filter. Versions that don't
   *    satisfy it are dropped, and nothing matching yields an empty result
   *    rather than an error, since a narrow-but-valid range matching zero
   *    versions is not a "not found" case.
   */
  range?: string | undefined
}

/**
 * Result of `getVersions` — the filtered version list plus enough context
 * (`time`, `distTags`) that callers rarely need a second fetch.
 */
export interface GetVersionsResult {
  distTags: Record<string, string>
  time: Record<string, string>
  versions: string[]
}

/**
 * Result of `getLatestVersion`.
 */
export interface LatestVersionResult {
  distTags: Record<string, string>
  publishedAt: string | undefined
  version: string
}

/**
 * Injectable HTTP adapter for the metadata client — the `json` half of the
 * npm registry client's `NpmHttpAdapter` (`./registry`), narrowed with `Pick`
 * rather than redeclared, so the method set has exactly ONE definition across
 * the whole npm surface.
 *
 * Narrowed rather than used whole because this client never fetches a tarball:
 * requiring `bytes` would force every caller and every test double to supply a
 * method the metadata path cannot call. A full `NpmHttpAdapter` satisfies this
 * type structurally, so one adapter object serves both clients.
 *
 * Both the Node (`httpJson` from `../http-request/node`) and browser
 * (`httpJson` from `../http-request/browser`) implementations match it
 * directly, which is what lets `./meta-cache/node` and `./meta-cache/browser`
 * differ only in which one they default to.
 */
export type NpmMetaHttpAdapter = Pick<NpmHttpAdapter, 'json'>

/**
 * The slimmed packument this client returns — top-level fields plus the
 * per-version map from `sliceVersionMeta`.
 */
export interface PackumentMetaSlim {
  distTags: Record<string, string>
  /**
   * `Date.now()` at fetch time (not the registry's `time.modified`) — lets
   * callers reason about cache freshness without inspecting the cache layer.
   */
  lastSynced: number
  name: string
  timeCreated?: string | undefined
  timeModified?: string | undefined
  // oxlint-disable-next-line socket/prefer-refined-record -- open string keys
  versions: Record<string, PackumentVersionMetaSlim>
}

/**
 * `'abbreviated'` matches npm's `Accept: application/vnd.npm.install-v1+json`
 * fast packument (no `_npmUser`); `'full'` is the plain packument.
 */
export type PackumentVariant = 'abbreviated' | 'full'

/**
 * Slimmed per-version metadata — `sliceVersionMeta`'s output shape for one
 * version entry.
 */
export interface PackumentVersionMetaSlim {
  attestations?: unknown | undefined
  deprecated?: string | undefined
  engines?: Record<string, string> | undefined
  integrity?: string | undefined
  shasum?: string | undefined
  /**
   * Boolean form of `_npmUser?.approver` — `true` when the version was
   * published through a staged/approval flow.
   */
  staged?: boolean | undefined
  tarball?: string | undefined
  time: string
  /**
   * Boolean form of `_npmUser?.trustedPublisher`.
   */
  trustedPublisher?: boolean | undefined
}

/**
 * Raw `_npmUser` shape from a full-variant packument version entry.
 */
export interface RawNpmUser {
  approver?: unknown | undefined
  trustedPublisher?: boolean | undefined
}

/**
 * Raw packument JSON as received from the registry — the input to
 * `slicePackument` / `sliceVersionMeta`.
 *
 * Deliberately separate from `./registry`'s `PackumentRecord` /
 * `PackumentVersion` / `PackumentVersionDist` hierarchy, not an oversight:
 * this client needs `_npmUser`, `engines`, and the full `dist.integrity` /
 * `dist.shasum` fields (for `getVersionTrustInfo` and the
 * abbreviated-vs-full variant split), none of which `./registry`'s
 * browser-safe, Trusted-Publisher-detection-only surface carries. The two
 * hierarchies are NOT meant to be interchangeable — passing a `./registry`
 * `PackumentVersion` where a `RawPackumentVersion` is expected needs an
 * explicit re-shape, since `PackumentVersion`'s `engines` and other extra
 * fields resolve through its `[field: string]: unknown` index signature.
 * `test/unit/npm/meta-types.test.mts` type-checks the fields the two
 * hierarchies DO intentionally share, so a future edit to either side can't
 * silently break that overlap.
 */
export interface RawPackument {
  'dist-tags'?: Record<string, string> | undefined
  name?: string | undefined
  time?: Record<string, string> | undefined
  // oxlint-disable-next-line socket/prefer-refined-record -- open string keys
  versions?: Record<string, RawPackumentVersion> | undefined
}

/**
 * Raw per-version entry from a packument. `_npmUser` is present only on the
 * `'full'` variant.
 */
export interface RawPackumentVersion {
  _npmUser?: RawNpmUser | undefined
  deprecated?: string | undefined
  dist?: RawVersionDist | undefined
  engines?: Record<string, string> | undefined
  [field: string]: unknown
}

/**
 * Raw `dist` shape from a packument version entry.
 */
export interface RawVersionDist {
  attestations?: unknown | undefined
  integrity?: string | undefined
  shasum?: string | undefined
  tarball?: string | undefined
}

/**
 * Per-version trust signals returned by `getVersionTrustInfo`. `approver`
 * mirrors `PackumentVersionMetaSlim.staged` — named for its source field
 * (`_npmUser.approver`) since this helper is specifically about trust
 * provenance rather than general slimmed metadata.
 */
export interface VersionTrustInfo {
  approver?: boolean | undefined
  attestations?: unknown | undefined
  integrity?: string | undefined
  shasum?: string | undefined
  trustedPublisher?: boolean | undefined
}
