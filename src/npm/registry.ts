/**
 * @file Browser-safe npm registry client — pure parsers + injectable-fetch
 *   shell. Safe for Chrome MV3 service workers, content scripts, and any
 *   environment without `node:*` builtins. The HTTP adapter is injected by the
 *   caller (`{ http: { json } }`) so Node callers pass `httpJson` from
 *   `@socketsecurity/lib/http-request` and browser callers pass `httpJson` from
 *   `@socketsecurity/lib/http-request/browser`. No network dependency at module
 *   load time.
 *
 *   ## Endpoints covered
 *
 *   - Packument: `registry.npmjs.org/<pkg>`
 *   - Version manifest (package.json):
 *     `cdn.jsdelivr.net/npm/<pkg>@<ver>/package.json`
 *   - Weekly downloads: `api.npmjs.org/downloads/point/last-week/<pkg>`
 *   - Attestation bundle: `registry.npmjs.org/-/npm/v1/attestations/<pkg>@<ver>`
 *   - Org packages: `registry.npmjs.org/-/org/<org>/package`
 *
 *   ## URL encoding
 *
 *   Registry endpoints (`registry.npmjs.org`, `api.npmjs.org`): scoped names
 *   encode to `@scope%2Fname` (one `encodeURIComponent` call that encodes the
 *   slash, then `%40` is restored to `@`).
 *   CDN endpoint (`cdn.jsdelivr.net`): scope and name are encoded separately,
 *   preserving the literal `/` between them. A prior extension bug sent
 *   `@scope%2Fname` to the CDN which returned 400; the fix is this split-encode
 *   path.
 *
 *   ## Trusted Publisher detection
 *
 *   From the packument alone, only `!!dist.attestations` is detectable —
 *   proving provenance was signed but not identifying which repo or workflow is
 *   configured as the TP. To get repo + workflow call `getAttestations()` then
 *   `parseProvenancePredicate()` to parse the SLSA
 *   `externalParameters.workflow` field. The npm access page
 *   (`/package/<name>/access`) is session-only HTML and is out of scope for
 *   this public client.
 */

import {
  StringPrototypeIndexOf,
  StringPrototypeSlice,
} from '../primordials/string'

const NPM_REGISTRY = 'https://registry.npmjs.org'
const NPM_DOWNLOADS_API = 'https://api.npmjs.org'
const CDN_JSDELIVR = 'https://cdn.jsdelivr.net'
const SLSA_PROVENANCE_TYPE = 'https://slsa.dev/provenance/v1'

/**
 * Injectable HTTP adapter. Pass `httpJson` from
 * `@socketsecurity/lib/http-request` (Node) or
 * `@socketsecurity/lib/http-request/browser` (browser / extension).
 */
export interface NpmHttpOptions {
  http: { json<T>(url: string): Promise<T> }
}

export interface AttestationBundleEntry {
  predicateType?: string | undefined
  bundle?: unknown | undefined
}

export interface AttestationBundle {
  attestations?: AttestationBundleEntry[] | undefined
}

export interface DownloadsRecord {
  downloads: number
  package: string
}

export interface OrgPackagesRecord {
  [packageName: string]: string
}

export interface PackumentVersionDist {
  attestations?: { url?: string | undefined } | undefined
  tarball?: string | undefined
}

export interface PackumentVersion {
  deprecated?: string | undefined
  dist?: PackumentVersionDist | undefined
  [field: string]: unknown
}

export interface PackumentRecord {
  'dist-tags': Record<string, string>
  distTags: Record<string, string>
  name: string
  time?: Record<string, string> | undefined
  versions: Record<string, PackumentVersion>
}

export interface ProvenancePredicate {
  buildDefinition?:
    | {
        externalParameters?:
          | {
              workflow?:
                | {
                    path?: string | undefined
                    ref?: string | undefined
                    repository?: string | undefined
                  }
                | undefined
            }
          | undefined
      }
    | undefined
  runDetails?:
    | {
        builder?: { id?: string | undefined } | undefined
      }
    | undefined
}

/**
 * Result of Trusted Publisher detection from a version entry.
 *
 * When `configured` is true, `repo` and `workflow` are populated only if the
 * attestation bundle was fetched and parsed — `detectTrustedPublisher()` alone
 * (from packument data) cannot provide them. Call `getAttestations()` +
 * `parseProvenancePredicate()` to obtain those fields.
 */
export interface TrustedPublisherResult {
  configured: boolean
  repo?: string | undefined
  workflow?: string | undefined
}

/**
 * Build the CDN path `<encoded-name>@<encoded-version>/package.json`.
 * Exposed as a pure function so callers can construct the full URL themselves.
 */
export function buildCdnPath(name: string, version: string): string {
  return `${encodeCdnName(name)}@${encodeURIComponent(version)}/package.json`
}

/**
 * Detect Trusted Publisher configuration from a packument version entry.
 *
 * From the packument alone, only the presence of `dist.attestations` is
 * detectable (`configured: true` means provenance was signed; it does NOT
 * confirm that a TP source is configured on npmjs.com). To get `repo` and
 * `workflow`, fetch the attestation bundle with `getAttestations()` and parse
 * it with `parseProvenancePredicate()`.
 */
export function detectTrustedPublisher(
  versionEntry: PackumentVersion,
): TrustedPublisherResult {
  if (!hasProvenance(versionEntry)) {
    return { configured: false }
  }
  return { configured: true }
}

/**
 * Encode a package name for use in registry CDN URLs.
 * Scope and name are encoded individually, preserving the literal `/`.
 * Use this for `cdn.jsdelivr.net` URLs — fixes the `@scope%2Fname` → 400 bug.
 */
export function encodeCdnName(name: string): string {
  if (StringPrototypeIndexOf(name, '/') === -1) {
    return encodeURIComponent(name)
  }
  const slashAt = StringPrototypeIndexOf(name, '/')
  const scope = StringPrototypeSlice(name, 0, slashAt)
  const pkg = StringPrototypeSlice(name, slashAt + 1)
  return `${encodeURIComponent(scope)}/${encodeURIComponent(pkg)}`
}

/**
 * Encode a package name for use in registry / download-API URLs.
 *
 * Registry form (`cdn: false`, the default): `encodeURIComponent` then restore
 * the leading `@` so `@scope/name` → `@scope%2Fname`.
 *
 * CDN form (`cdn: true`): scope and name are encoded individually so the
 * literal `/` separator is preserved: `@scope/name` → `@scope/name` (each
 * segment encoded separately). This fixes the `@scope%2Fname` → 400 bug on
 * `cdn.jsdelivr.net`.
 *
 * @unused No internal or Socket consumers (exercised only by its unit tests).
 */
export function encodePackageName(
  name: string,
  options?: { cdn?: boolean | undefined } | undefined,
): string {
  const opts = { __proto__: null, cdn: false, ...options }
  if (opts.cdn) {
    return encodeCdnName(name)
  }
  return encodeRegistryName(name)
}

/**
 * Encode a package name for use in registry / download-API URLs.
 * Applies `encodeURIComponent` then restores `@` so scoped names become
 * `@scope%2Fname`.
 */
export function encodeRegistryName(name: string): string {
  return encodeURIComponent(name).replace('%40', '@')
}

/**
 * Fetch the attestation bundle for a package version from the npm transparency
 * log. Returns `undefined` when no attestations entry is present in the
 * packument (404 is treated as absent rather than an error).
 */
export async function getAttestations(
  name: string,
  version: string,
  options: NpmHttpOptions,
): Promise<AttestationBundle | undefined> {
  const opts = { __proto__: null, ...options } as NpmHttpOptions
  const encoded = `${encodeRegistryName(name)}@${encodeURIComponent(version)}`
  const url = `${NPM_REGISTRY}/-/npm/v1/attestations/${encoded}`
  try {
    return await opts.http.json<AttestationBundle>(url)
  } catch {
    return undefined
  }
}

/**
 * Fetch the list of packages belonging to an npm org.
 * Returns package names as a string array.
 */
export async function getOrgPackages(
  org: string,
  options: NpmHttpOptions,
): Promise<string[]> {
  const opts = { __proto__: null, ...options } as NpmHttpOptions
  const url = `${NPM_REGISTRY}/-/org/${encodeURIComponent(org)}/package`
  const raw = await opts.http.json<OrgPackagesRecord>(url)
  return Object.keys(raw)
}

/**
 * Fetch and parse the full packument for a package.
 */
export async function getPackument(
  name: string,
  options: NpmHttpOptions,
): Promise<PackumentRecord> {
  const opts = { __proto__: null, ...options } as NpmHttpOptions
  const url = `${NPM_REGISTRY}/${encodeRegistryName(name)}`
  const raw = await opts.http.json<unknown>(url)
  const parsed = parsePackument(raw)
  if (!parsed) {
    throw new Error(
      `getPackument: invalid packument response for "${name}" from ${url}`,
    )
  }
  return parsed
}

/**
 * Fetch a version's package.json via the jsDelivr CDN.
 *
 * Uses split-encode for scoped names so `cdn.jsdelivr.net` receives the literal
 * `/` between scope and name (not `%2F` which causes 400s).
 *
 * @unused No internal or Socket consumers (exercised only by its unit tests).
 */
export async function getVersionManifest(
  name: string,
  version: string,
  options: NpmHttpOptions,
): Promise<Record<string, unknown>> {
  const opts = { __proto__: null, ...options } as NpmHttpOptions
  const cdnPath = buildCdnPath(name, version)
  const url = `${CDN_JSDELIVR}/npm/${cdnPath}`
  return opts.http.json<Record<string, unknown>>(url)
}

/**
 * Fetch last-week download counts for a package from the npm downloads API.
 *
 * @unused No internal or Socket consumers (exercised only by its unit tests).
 */
export async function getWeeklyDownloads(
  name: string,
  options: NpmHttpOptions,
): Promise<DownloadsRecord> {
  const opts = { __proto__: null, ...options } as NpmHttpOptions
  const url = `${NPM_DOWNLOADS_API}/downloads/point/last-week/${encodeRegistryName(name)}`
  return opts.http.json<DownloadsRecord>(url)
}

/**
 * Return true when `versionEntry.dist.attestations` is present — indicating a
 * SLSA provenance attestation was produced for this version.
 */
export function hasProvenance(versionEntry: PackumentVersion): boolean {
  return !!versionEntry.dist?.attestations
}

/**
 * Return `true` when `version` of `name` is already published to the registry.
 * Authoritative — reads the packument's `versions` map rather than a CDN, so a
 * pre-publish guard never false-negatives on CDN lag (the asymmetric-cost case:
 * a wrong "not published" invites a duplicate-version publish attempt). Returns
 * `false` when the package does not exist or the packument fetch fails.
 *
 * @unused No internal or Socket consumers (exercised only by its unit tests).
 */
export async function isVersionPublished(
  name: string,
  version: string,
  options: NpmHttpOptions,
): Promise<boolean> {
  try {
    const packument = await getPackument(name, options)
    return packument.versions[version] !== undefined
  } catch {
    return false
  }
}

/**
 * Parse a raw packument JSON response into a typed `PackumentRecord`.
 * Adds the `distTags` alias for `dist-tags` so callers don't need bracket
 * notation. Returns `undefined` when the input is not a valid packument shape.
 */
export function parsePackument(raw: unknown): PackumentRecord | undefined {
  if (
    raw === undefined ||
    raw === null ||
    typeof raw !== 'object' ||
    !('versions' in raw) ||
    !('dist-tags' in raw)
  ) {
    return undefined
  }
  const rec = raw as {
    'dist-tags': Record<string, string>
    name?: string | undefined
    time?: Record<string, string> | undefined
    versions: Record<string, PackumentVersion>
  }
  return {
    'dist-tags': rec['dist-tags'] ?? {},
    distTags: rec['dist-tags'] ?? {},
    name: typeof rec.name === 'string' ? rec.name : '',
    time: rec.time,
    versions: rec.versions ?? {},
  }
}

/**
 * Parse an npm transparency-log attestation bundle (the JSON returned from
 * `registry.npmjs.org/-/npm/v1/attestations/<pkg>@<ver>`) and extract the
 * SLSA provenance predicate.
 *
 * Returns the first SLSA provenance v1 predicate found, or `undefined` when
 * none is present or the bundle is malformed.
 */
export function parseProvenancePredicate(
  bundle: unknown,
): ProvenancePredicate | undefined {
  if (
    bundle === undefined ||
    bundle === null ||
    typeof bundle !== 'object' ||
    !('attestations' in bundle) ||
    !Array.isArray((bundle as AttestationBundle).attestations)
  ) {
    return undefined
  }
  const { attestations } = bundle as AttestationBundle
  /* c8 ignore start - the prior Array.isArray guard above already narrows
   * `attestations` to a real array; even an empty array is truthy, so this
   * falsy-check can never take its true branch at runtime. Kept only to
   * satisfy the optional `attestations?: ... | undefined` field type. */
  if (!attestations) {
    return undefined
  }
  /* c8 ignore stop */
  for (const entry of attestations) {
    if (entry.predicateType !== SLSA_PROVENANCE_TYPE) {
      continue
    }
    const b = entry.bundle
    if (b === undefined || b === null || typeof b !== 'object') {
      continue
    }
    const verificationMaterial = (
      b as { verificationMaterial?: unknown | undefined }
    ).verificationMaterial
    if (
      verificationMaterial === undefined ||
      verificationMaterial === null ||
      typeof verificationMaterial !== 'object'
    ) {
      continue
    }
    const content = (verificationMaterial as { content?: unknown | undefined })
      .content
    if (typeof content !== 'string') {
      continue
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      continue
    }
    if (parsed === undefined || parsed === null || typeof parsed !== 'object') {
      continue
    }
    const envelope = parsed as { payload?: string | undefined }
    if (typeof envelope.payload !== 'string') {
      continue
    }
    let payload: unknown
    try {
      payload = JSON.parse(atob(envelope.payload))
    } catch {
      continue
    }
    if (
      payload === undefined ||
      payload === null ||
      typeof payload !== 'object'
    ) {
      continue
    }
    const statement = payload as { predicate?: unknown | undefined }
    if (
      statement.predicate === undefined ||
      statement.predicate === null ||
      typeof statement.predicate !== 'object'
    ) {
      continue
    }
    return statement.predicate as ProvenancePredicate
  }
  return undefined
}
