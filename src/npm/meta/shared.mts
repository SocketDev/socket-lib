/**
 * @file Platform-free core of the npm metadata client — the derived helpers
 *   (`getVersions`, `getLatestVersion`, `getPublishDate`, `getBatch`,
 *   `getVersionTrustInfo`) and their `safe*` fail-open variants, plus the pure
 *   date/semver predicates they lean on.
 *   Every helper here takes a `fetchSlim` as its FIRST parameter rather than
 *   importing one. That is the whole platform split: the only thing separating
 *   a Node metadata client from a browser one is which `getPackumentSlim` it
 *   calls, so `./node` and `./browser` are each a thin binding of these
 *   functions to their own twin of `../meta-cache`.
 *   Nothing in this module reaches a `node:` builtin. That includes the batch
 *   path: `pEach` comes from `../../promises/iterate`, whose lazy
 *   `timers/promises` require uses a BARE specifier, so a browser bundler
 *   stubs it through the package's top-level `browser` field instead of
 *   throwing `UnhandledSchemeError` on a `node:` prefix.
 */

import { errorMessage } from '../../errors/message.mjs'
import { RangeErrorCtor } from '../../primordials/error.mjs'
import { pEach } from '../../promises/iterate.mjs'
import { getSemver } from '../../versions/shared.mjs'
import { httpErrorStatus } from '../registry/live.mjs'
import { PackumentNotFoundError } from '../meta-cache/shared.mjs'

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

const ALL_DIGITS_RE = /^\d+$/

/**
 * The one capability every helper here needs and none of them may import: a
 * cached packument fetch. `./node` binds `../meta-cache/node`'s
 * `getPackumentSlim`; `./browser` binds `../meta-cache/browser`'s.
 */
export type FetchPackumentSlim = (
  name: string,
  options?: GetPackumentSlimOptions | undefined,
) => Promise<PackumentMetaSlim>

/**
 * Extract the HTTP status code from a caught error.
 *
 * Structural rather than `instanceof`: the Node and browser `http-request`
 * twins each declare their OWN `HttpResponseError` class, so an `instanceof`
 * check would recognize only whichever one this module happened to import and
 * silently return `undefined` for the other, or for a status-carrying error
 * from an injected adapter. `httpErrorStatus` reads `response.status` then
 * `status`, which covers both twins and `PackumentNotFoundError` alike.
 */
export function extractHttpStatus(error: unknown): number | undefined {
  return httpErrorStatus(error)
}

/**
 * Fetch `fetchSlim` for every name with bounded concurrency, returning an
 * index-preserving array. Every item is attempted regardless of
 * `throwOnError` — nothing is aborted in-flight. A per-item failure becomes a
 * `PackageError` at that index; when `throwOnError` is `true`, once every
 * item has settled the error from the LOWEST-INDEX failed item is thrown —
 * deterministic regardless of settle order.
 */
export async function getBatch(
  fetchSlim: FetchPackumentSlim,
  names: string[],
  options?: BatchOptions | undefined,
): Promise<BatchResult[]> {
  const opts = {
    __proto__: null,
    concurrency: 8,
    throwOnError: false,
    ...options,
  } as Required<Pick<BatchOptions, 'concurrency' | 'throwOnError'>> &
    BatchOptions

  const results: BatchResult[] = Array.from({ length: names.length })
  const failures: Array<{ error: unknown; index: number }> = []
  await pEach(
    names.map((name, index) => ({ index, name })),
    async item => {
      try {
        results[item.index] = await fetchSlim(item.name, opts)
      } catch (e) {
        failures.push({ error: e, index: item.index })
        results[item.index] = {
          error: errorMessage(e),
          name: item.name,
          status: extractHttpStatus(e),
        }
      }
    },
    opts.concurrency,
  )
  if (opts.throwOnError && failures.length > 0) {
    let lowest = failures[0]!
    for (let i = 0, { length } = failures; i < length; i += 1) {
      const failure = failures[i]!
      if (failure.index < lowest.index) {
        lowest = failure
      }
    }
    throw lowest.error
  }
  return results
}

/**
 * Resolve the latest version — `distTags.latest` when no `range` is given, or
 * (when `range` is given) the same dist-tag / exact-version / semver-range
 * resolution `getVersions` uses (`resolveRequestedVersions`), narrowed to a
 * single version. There is no silent fallback to `distTags.latest`: a
 * dist-tag or exact version that doesn't resolve throws (same contract as
 * `getVersions`), and a range matching nothing throws too — an unsatisfiable
 * range must never return a version outside what the caller asked for.
 *
 * @throws {PackumentNotFoundError} When `range` names an exact version or
 *   dist-tag that isn't present in the packument, or a semver range that no
 *   version satisfies.
 */
export async function getLatestVersion(
  fetchSlim: FetchPackumentSlim,
  name: string,
  options?: GetVersionsOptions | undefined,
): Promise<LatestVersionResult> {
  const opts = { __proto__: null, ...options } as GetVersionsOptions
  const meta = await fetchSlim(name, opts)
  if (!opts.range) {
    const version = meta.distTags['latest'] ?? ''
    return {
      distTags: meta.distTags,
      publishedAt: meta.versions[version]?.time || undefined,
      version,
    }
  }
  const candidates = resolveRequestedVersions(name, meta, opts)
  const semver = getSemver()
  // Semver-max among the resolved candidates — NOT "most recently
  // published". A lower-semver backport can be published AFTER a higher
  // release ships (e.g. a 1.2.1 LTS backport published after 2.0.0 is
  // already out); resolving by publish-time order would let that backport
  // incorrectly win a `>=1` lookup. `includePrerelease: true` here is safe —
  // `candidates` is already the correctly `includePrerelease`-filtered set
  // (or a single dist-tag/exact-version match, always "included" regardless
  // of prerelease status); this call only picks the max among them.
  const version = semver.maxSatisfying(candidates, '*', {
    includePrerelease: true,
    loose: !!opts.loose,
  })
  if (!version) {
    throw new PackumentNotFoundError(
      name,
      404,
      `getLatestVersion: no version of "${name}" satisfies "${opts.range}".`,
    )
  }
  return {
    distTags: meta.distTags,
    publishedAt: meta.versions[version]?.time || undefined,
    version,
  }
}

/**
 * Look up a single version's publish time (ISO string), or `undefined` when
 * the version isn't in the packument.
 */
export async function getPublishDate(
  fetchSlim: FetchPackumentSlim,
  name: string,
  version: string,
  options?: GetPackumentSlimOptions | undefined,
): Promise<string | undefined> {
  const meta = await fetchSlim(name, options)
  return meta.versions[version]?.time || undefined
}

/**
 * List versions, optionally filtered by `range` (a semver range, an exact
 * version, or a dist-tag name — see `GetVersionsOptions.range`), an `after`
 * time floor, and/or a `minAgeDays` maturity window. See `GetVersionsOptions`
 * for the `minAgeDays` end-of-UTC-day anchor semantics.
 *
 * @throws {PackumentNotFoundError} When `range` names an exact version or
 *   dist-tag that isn't present in the packument.
 */
export async function getVersions(
  fetchSlim: FetchPackumentSlim,
  name: string,
  options?: GetVersionsOptions | undefined,
): Promise<GetVersionsResult> {
  const opts = { __proto__: null, ...options } as GetVersionsOptions
  const meta = await fetchSlim(name, opts)

  const time: Record<string, string> = {}
  const versionKeys = Object.keys(meta.versions)
  for (let i = 0, { length } = versionKeys; i < length; i += 1) {
    const version = versionKeys[i]!
    time[version] = meta.versions[version]!.time
  }

  let versions = resolveRequestedVersions(name, meta, opts)

  if (opts.after !== undefined) {
    const floorMs = toEpochMs(opts.after)
    versions = versions.filter(v => {
      // A version with no recorded publish time cannot be proven to satisfy
      // an `after`/`minAgeDays` floor, so it is EXCLUDED. For a time-based
      // filter, an unfairly dropped false negative is the safer failure mode
      // than an unfairly included false positive.
      const publishedAt = time[v]
      return !!publishedAt && Date.parse(publishedAt) >= floorMs
    })
  }
  if (opts.minAgeDays !== undefined) {
    const minAgeDays = opts.minAgeDays
    const now = Date.now()
    versions = versions.filter(v => {
      const publishedAt = time[v]
      return !!publishedAt && isMatured(publishedAt, minAgeDays, now)
    })
  }

  return { distTags: meta.distTags, time, versions }
}

/**
 * Per-version trust signals (forces `variant: 'full'` — `_npmUser` is absent
 * from the abbreviated packument).
 */
export async function getVersionTrustInfo(
  fetchSlim: FetchPackumentSlim,
  name: string,
  options?: GetPackumentSlimOptions | undefined,
  // oxlint-disable-next-line socket/prefer-refined-record -- open string keys
): Promise<Record<string, VersionTrustInfo>> {
  const fullOptions = {
    __proto__: null,
    ...options,
    variant: 'full',
  } as GetPackumentSlimOptions
  const meta = await fetchSlim(name, fullOptions)
  // oxlint-disable-next-line socket/prefer-refined-record -- open string keys
  const result: Record<string, VersionTrustInfo> = {}
  const versions = Object.keys(meta.versions)
  for (let i = 0, { length } = versions; i < length; i += 1) {
    const version = versions[i]!
    const entry = meta.versions[version]!
    result[version] = {
      approver: entry.staged,
      attestations: entry.attestations,
      integrity: entry.integrity,
      shasum: entry.shasum,
      trustedPublisher: entry.trustedPublisher,
    }
  }
  return result
}

/**
 * `true` when `publishedAt` is at least `minAgeDays` days old, anchored to the
 * END of `publishedAt`'s UTC day, matching Socket soak-window semantics: a
 * version published at any point during a UTC day matures at the same
 * wall-clock instant, `minAgeDays` later at 23:59:59.999 UTC. Returns `false`
 * for an unparseable `publishedAt`.
 */
export function isMatured(
  publishedAt: string,
  minAgeDays: number,
  now: number = Date.now(),
): boolean {
  const publishedMs = Date.parse(publishedAt)
  if (Number.isNaN(publishedMs)) {
    return false
  }
  const published = new Date(publishedMs)
  const endOfPublishedDayMs = Date.UTC(
    published.getUTCFullYear(),
    published.getUTCMonth(),
    published.getUTCDate(),
    23,
    59,
    59,
    999,
  )
  const maturesAtMs = endOfPublishedDayMs + minAgeDays * 24 * 60 * 60 * 1000
  return now >= maturesAtMs
}

/**
 * Resolve `options.range` against a packument's dist-tags / version set.
 * Exported standalone so its resolution order is independently testable. See
 * `GetVersionsOptions.range` for the full priority-order contract (dist-tag →
 * exact version → semver range filter).
 *
 * @throws {PackumentNotFoundError} When `range` names a dist-tag or exact
 *   version that isn't present in the packument.
 */
export function resolveRequestedVersions(
  name: string,
  meta: PackumentMetaSlim,
  options: GetVersionsOptions,
): string[] {
  const opts = { __proto__: null, ...options } as GetVersionsOptions
  const allVersions = Object.keys(meta.versions)
  const { range } = opts
  if (!range) {
    return allVersions
  }
  if (Object.hasOwn(meta.distTags, range)) {
    const tagged = meta.distTags[range]!
    if (!Object.hasOwn(meta.versions, tagged)) {
      throw new PackumentNotFoundError(
        name,
        404,
        `getVersions: dist-tag "${range}" on "${name}" points to version "${tagged}", which is not in the packument.`,
      )
    }
    return [tagged]
  }
  const semver = getSemver()
  const normalized = semver.valid(range, { loose: !!opts.loose })
  if (normalized) {
    // Look up the NORMALIZED form first (registry version keys are always
    // clean) — falling back to the raw string covers a lookup key that
    // happens to match verbatim despite not being the canonical form.
    const resolvedVersion = Object.hasOwn(meta.versions, normalized)
      ? normalized
      : range
    if (!Object.hasOwn(meta.versions, resolvedVersion)) {
      throw new PackumentNotFoundError(
        name,
        404,
        `getVersions: version "${range}" not found for "${name}".`,
      )
    }
    return [resolvedVersion]
  }
  const semverOptions = {
    includePrerelease: !!opts.includePrerelease,
    loose: !!opts.loose,
  }
  return allVersions.filter(v => semver.satisfies(v, range, semverOptions))
}

/**
 * Fail-open `getLatestVersion` — `undefined` on any error.
 */
export async function safeGetLatestVersion(
  fetchSlim: FetchPackumentSlim,
  name: string,
  options?: GetVersionsOptions | undefined,
): Promise<LatestVersionResult | undefined> {
  try {
    return await getLatestVersion(fetchSlim, name, options)
  } catch {
    return undefined
  }
}

/**
 * Fail-open packument fetch — `undefined` on any error.
 */
export async function safeGetPackumentSlim(
  fetchSlim: FetchPackumentSlim,
  name: string,
  options?: GetPackumentSlimOptions | undefined,
): Promise<PackumentMetaSlim | undefined> {
  try {
    return await fetchSlim(name, options)
  } catch {
    return undefined
  }
}

/**
 * Fail-open `getPublishDate` — `undefined` on any error.
 */
export async function safeGetPublishDate(
  fetchSlim: FetchPackumentSlim,
  name: string,
  version: string,
  options?: GetPackumentSlimOptions | undefined,
): Promise<string | undefined> {
  try {
    return await getPublishDate(fetchSlim, name, version, options)
  } catch {
    return undefined
  }
}

/**
 * Fail-open `getVersions` — an empty result on any error.
 */
export async function safeGetVersions(
  fetchSlim: FetchPackumentSlim,
  name: string,
  options?: GetVersionsOptions | undefined,
): Promise<GetVersionsResult> {
  try {
    return await getVersions(fetchSlim, name, options)
  } catch {
    return { distTags: {}, time: {}, versions: [] }
  }
}

/**
 * Fail-open `getVersionTrustInfo` — an empty record on any error.
 */
export async function safeGetVersionTrustInfo(
  fetchSlim: FetchPackumentSlim,
  name: string,
  options?: GetPackumentSlimOptions | undefined,
  // oxlint-disable-next-line socket/prefer-refined-record -- open string keys
): Promise<Record<string, VersionTrustInfo>> {
  try {
    return await getVersionTrustInfo(fetchSlim, name, options)
  } catch {
    return {}
  }
}

/**
 * Resolve an `after` filter value to epoch milliseconds. A `number` is used
 * as-is. A string is treated as an epoch ONLY when it is entirely digits
 * (`/^\d+$/`) — never by trying `Number()` first, which would also accept
 * whitespace, exponents, and other numeric-ish forms `Date.parse` should get
 * a chance at instead. Anything not all-digits is parsed via `Date.parse`.
 *
 * @throws {RangeError} When `after` cannot be resolved to a valid epoch —
 *   silently skipping the `after` filter on an unparseable value is the exact
 *   reference-implementation bug this module exists to avoid.
 */
export function toEpochMs(after: string | number): number {
  const epochMs =
    typeof after === 'number'
      ? after
      : ALL_DIGITS_RE.test(after)
        ? Number(after)
        : Date.parse(after)
  if (Number.isNaN(epochMs)) {
    throw new RangeErrorCtor(
      `toEpochMs: "${after}" is not a valid ISO 8601 date string or numeric epoch`,
    )
  }
  return epochMs
}
