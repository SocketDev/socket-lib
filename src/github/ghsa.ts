/**
 * @fileoverview GitHub Security Advisory (GHSA) lookups.
 *
 * Three layers, narrowest first:
 *
 *   - `cacheFetchGhsa` — caches GHSA fetches in the same `TtlCache`
 *     used by ref resolution (5-minute TTL, two-tier).
 *   - `fetchGhsaDetails` — REST `/advisories/:id` with the same
 *     empty-body fallback to GraphQL that ref resolution uses.
 *   - `fetchGhsaDetailsViaGraphQL` — GraphQL `securityAdvisory(...)`
 *     with shape normalization back to the REST surface so callers
 *     don't have to know which transport ran.
 */

import process from 'node:process'

import { httpRequest } from '../http-request'
import { ErrorCtor, JSONParse, JSONStringify } from '../primordials'

import { fetchGitHub } from './fetch'
import { getGithubCache } from './refs'
import { getGitHubToken } from './token'
import { GITHUB_GRAPHQL_URL, GitHubEmptyBodyError } from './types'

import type { GhsaDetails, GitHubFetchOptions } from './types'

/**
 * Fetch GitHub Security Advisory details with caching.
 * Retrieves advisory information with two-tier caching (in-memory + persistent).
 * Cached results are stored with the default TTL (5 minutes).
 *
 * Caching behavior:
 * - Checks in-memory cache first for immediate response
 * - Falls back to persistent disk cache if not in memory
 * - Fetches from API only if not cached
 * - Stores result in both cache tiers
 * - Respects `DISABLE_GITHUB_CACHE` env var
 *
 * @param ghsaId - GHSA identifier to fetch
 * @param options - Fetch options including authentication token
 * @returns Complete advisory details
 *
 * @throws {Error} If advisory cannot be found or API request fails
 * @throws {GitHubRateLimitError} When API rate limit is exceeded
 *
 * @example
 * ```ts
 * // First call hits API
 * const advisory = await cacheFetchGhsa('GHSA-1234-5678-90ab')
 *
 * // Second call within 5 minutes returns cached data
 * const cached = await cacheFetchGhsa('GHSA-1234-5678-90ab')
 * ```
 *
 * @example
 * ```ts
 * // Disable caching for fresh data
 * process.env.DISABLE_GITHUB_CACHE = '1'
 * const advisory = await cacheFetchGhsa('GHSA-xxxx-yyyy-zzzz')
 * ```
 */
export async function cacheFetchGhsa(
  ghsaId: string,
  options?: GitHubFetchOptions | undefined,
): Promise<GhsaDetails> {
  const cache = getGithubCache()
  const key = `ghsa:${ghsaId}`

  // Cache-bypass arm fires only when DISABLE_GITHUB_CACHE env is set.
  /* c8 ignore next 3 */
  if (process.env['DISABLE_GITHUB_CACHE']) {
    return await fetchGhsaDetails(ghsaId, options)
  }

  // Use getOrFetch to prevent race conditions (thundering herd).
  return (await cache.getOrFetch(key, async () => {
    return await fetchGhsaDetails(ghsaId, options)
  })) as GhsaDetails
}

/**
 * Fetch GitHub Security Advisory details from the API.
 * Retrieves complete advisory information including severity, affected packages,
 * CVSS scores, and CWE classifications.
 *
 * @param ghsaId - GHSA identifier to fetch (e.g., 'GHSA-xxxx-yyyy-zzzz')
 * @param options - Fetch options including authentication token
 * @returns Complete advisory details with normalized field names
 *
 * @throws {Error} If advisory cannot be found or API request fails
 * @throws {GitHubRateLimitError} When API rate limit is exceeded
 *
 * @example
 * ```ts
 * const advisory = await fetchGhsaDetails('GHSA-1234-5678-90ab')
 * console.log(`Severity: ${advisory.severity}`)
 * console.log(`Affects: ${advisory.vulnerabilities.length} packages`)
 * if (advisory.cvss) {
 *   console.log(`CVSS Score: ${advisory.cvss.score}`)
 * }
 * ```
 *
 * @example
 * ```ts
 * // Check if vulnerability is patched
 * const advisory = await fetchGhsaDetails('GHSA-xxxx-yyyy-zzzz')
 * for (const vuln of advisory.vulnerabilities) {
 *   if (vuln.firstPatchedVersion) {
 *     console.log(
 *       `Patched in ${vuln.package.name}@${vuln.firstPatchedVersion.identifier}`
 *     )
 *   }
 * }
 * ```
 */
export async function fetchGhsaDetails(
  ghsaId: string,
  options?: GitHubFetchOptions | undefined,
): Promise<GhsaDetails> {
  /* c8 ignore start - External GitHub API call */
  const url = `https://api.github.com/advisories/${ghsaId}`
  try {
    const data = await fetchGitHub<{
      aliases?: string[]
      cvss: unknown
      cwes?: Array<{ cweId: string; name: string; description: string }>
      details: string
      ghsa_id: string
      published_at: string
      references?: Array<{ url: string }>
      severity: string
      summary: string
      updated_at: string
      vulnerabilities?: Array<{
        package: { ecosystem: string; name: string }
        vulnerableVersionRange: string
        firstPatchedVersion: { identifier: string } | null
      }>
      withdrawn_at: string
    }>(url, options)

    return {
      ghsaId: data.ghsa_id,
      summary: data.summary,
      details: data.details,
      severity: data.severity,
      aliases: data.aliases || [],
      publishedAt: data.published_at,
      updatedAt: data.updated_at,
      withdrawnAt: data.withdrawn_at,
      references: data.references || [],
      vulnerabilities: data.vulnerabilities || [],
      cvss: data.cvss as { score: number; vectorString: string } | null,
      cwes: data.cwes || [],
    }
  } catch (e) {
    // -------------------------------------------------------------
    // Why we narrow the catch with `instanceof GitHubEmptyBodyError`:
    //
    //   We ONLY want to fall back to GraphQL on the documented
    //   incident shape (200 OK + empty body). Other errors should
    //   propagate as-is so the caller sees the real cause:
    //     - Rate limit (`GitHubRateLimitError`) → user needs to set
    //       GITHUB_TOKEN; running a parallel GraphQL call would just
    //       hit the same rate-limit budget and confuse the message.
    //     - 404 → advisory genuinely doesn't exist; we want the
    //       clean "not found" surface, not a GraphQL retry.
    //     - 5xx → transient; pRetry on the caller side handles it.
    //   Only the empty-body case is worth a parallel-transport try.
    //
    // GraphQL exposes the same data with minor shape diffs that
    // `fetchGhsaDetailsViaGraphQL` normalizes back to the REST
    // shape so callers don't see the difference.
    // -------------------------------------------------------------
    if (e instanceof GitHubEmptyBodyError) {
      try {
        return await fetchGhsaDetailsViaGraphQL(ghsaId, options)
      } catch (cause) {
        throw new ErrorCtor(
          `Failed to fetch advisory ${ghsaId}: both REST and GraphQL backends degraded`,
          { cause },
        )
      }
    }
    throw e
  }
  /* c8 ignore stop */
}

/**
 * GraphQL counterpart for `fetchGhsaDetails`.
 *
 * What it does:
 *   Queries the GraphQL `securityAdvisory(ghsaId)` connection and
 *   reshapes the response to match the REST `/advisories/:id` JSON
 *   so callers don't have to know which transport ran.
 *
 * Three normalizations the REST shape differs from GraphQL on:
 *
 *   1. Severity case
 *      REST returns lowercase strings like "moderate", "high".
 *      GraphQL returns SCREAMING_CASE enum values: "MODERATE",
 *      "HIGH", "CRITICAL". We `.toLowerCase()` so callers can
 *      compare against a single canonical form.
 *
 *   2. Identifiers vs. aliases
 *      REST has an `aliases: ["CVE-2024-..."]` array — a flat list
 *      of non-GHSA IDs (CVEs, etc.) for the same vulnerability.
 *      GraphQL has `identifiers: [{type, value}]` which INCLUDES
 *      the advisory's own GHSA id alongside CVE ids. We filter
 *      out the GHSA self-reference so the list matches REST.
 *
 *   3. Connection wrapping
 *      GraphQL wraps array fields in `{ nodes: [...] }` connection
 *      objects (it's how pagination works in GraphQL). REST
 *      returns plain arrays. We unwrap with `?.nodes ?? []`.
 *
 *   `description` (GraphQL) maps to `details` (REST) — same data,
 *   different field name. The mapping below renames it.
 *
 * Token handling:
 *   We re-derive the token from `options.token || getGitHubToken()`
 *   because this function may be called from places that didn't
 *   thread an explicit token through. GraphQL queries to private
 *   data require auth even when the equivalent REST GET works
 *   anonymously, so the auth header is mandatory in practice.
 */
export async function fetchGhsaDetailsViaGraphQL(
  ghsaId: string,
  options?: GitHubFetchOptions | undefined,
): Promise<GhsaDetails> {
  const opts = { __proto__: null, ...options } as GitHubFetchOptions
  const token = opts.token || getGitHubToken()
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'socket-registry-github-client',
    ...opts.headers,
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  const query = `query($ghsaId: String!) {
    securityAdvisory(ghsaId: $ghsaId) {
      ghsaId
      summary
      description
      severity
      publishedAt
      updatedAt
      withdrawnAt
      cvss { score vectorString }
      cwes(first: 50) { nodes { cweId name description } }
      references { url }
      vulnerabilities(first: 100) {
        nodes {
          package { ecosystem name }
          vulnerableVersionRange
          firstPatchedVersion { identifier }
        }
      }
      identifiers { type value }
    }
  }`
  const response = await httpRequest(GITHUB_GRAPHQL_URL, {
    body: JSONStringify({ query, variables: { ghsaId } }),
    headers,
    method: 'POST',
  })
  if (!response.ok) {
    throw new ErrorCtor(
      `GitHub GraphQL API error ${response.status}: ${response.statusText}`,
    )
  }
  if (response.body.byteLength === 0) {
    throw new GitHubEmptyBodyError(GITHUB_GRAPHQL_URL)
  }
  let parsed: {
    data?: {
      securityAdvisory?: {
        ghsaId: string
        summary: string
        description: string
        severity: string
        publishedAt: string
        updatedAt: string
        withdrawnAt: string | null
        cvss?: { score: number; vectorString: string } | null
        cwes?: {
          nodes?: Array<{ cweId: string; name: string; description: string }>
        }
        references?: Array<{ url: string }>
        vulnerabilities?: {
          nodes?: Array<{
            package: { ecosystem: string; name: string }
            vulnerableVersionRange: string
            firstPatchedVersion: { identifier: string } | null
          }>
        }
        identifiers?: Array<{ type: string; value: string }>
      } | null
    }
    errors?: Array<{ message: string }>
  }
  try {
    parsed = JSONParse(response.body.toString('utf8'))
  } catch (cause) {
    throw new ErrorCtor(
      `Failed to parse GitHub GraphQL response for advisory ${ghsaId}`,
      { cause },
    )
  }
  if (parsed.errors?.length) {
    throw new ErrorCtor(
      `GraphQL securityAdvisory(${ghsaId}) returned errors: ${parsed.errors.map(e => e.message).join('; ')}`,
    )
  }
  const adv = parsed.data?.securityAdvisory
  // !adv arm fires only when GHSA id doesn't exist.
  /* c8 ignore next 3 */
  if (!adv) {
    throw new ErrorCtor(`GHSA ${ghsaId} not found`)
  }
  // The ?? defaults across identifiers/withdrawnAt/references/
  // vulnerabilities/cvss/cwes fire only when GraphQL returns minimal
  // advisory shape; tests seed rich responses.
  /* c8 ignore start */
  return {
    ghsaId: adv.ghsaId,
    summary: adv.summary,
    details: adv.description,
    severity: adv.severity.toLowerCase(),
    aliases:
      adv.identifiers?.filter(i => i.type !== 'GHSA').map(i => i.value) ?? [],
    publishedAt: adv.publishedAt,
    updatedAt: adv.updatedAt,
    withdrawnAt: adv.withdrawnAt ?? '',
    references: adv.references ?? [],
    vulnerabilities: adv.vulnerabilities?.nodes ?? [],
    // GhsaDetails.cvss is typed `... | null` to match the REST
    // `/advisories/:id` shape. Preserving `null` here is the external-
    // API-contract exception called out in the lint rule docs.
    // oxlint-disable-next-line socket/prefer-undefined-over-null
    cvss: adv.cvss ?? null,
    cwes: adv.cwes?.nodes ?? [],
  }
  /* c8 ignore stop */
}
