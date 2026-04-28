/**
 * @fileoverview GitHub utilities for Socket projects.
 * Provides GitHub API integration for repository operations.
 *
 * Authentication:
 * - getGitHubToken: Retrieve GitHub token from environment variables
 * - fetchGitHub: Authenticated GitHub API requests with rate limit handling
 *
 * Ref Resolution:
 * - resolveRefToSha: Convert tags/branches to commit SHAs (with memoization and persistent cache)
 * - clearRefCache: Clear the in-memory memoization cache
 *
 * Caching:
 * - Uses cacache for persistent storage with in-memory memoization
 * - Two-tier caching: in-memory (Map) for hot data, persistent (cacache) for durability
 * - Default TTL: 5 minutes
 * - Disable with DISABLE_GITHUB_CACHE env var
 *
 * Rate Limiting:
 * - Automatic rate limit detection and error messages
 * - Cache to minimize API calls
 */

import process from 'node:process'

import { createTtlCache } from './cache-with-ttl'
import { getGhToken, getGithubToken } from './env/github'
import { getSocketCliGithubToken } from './env/socket-cli'
import { errorMessage } from './errors'
import { httpRequest } from './http-request'
import { DateCtor, ErrorCtor, JSONParse, JSONStringify } from './primordials'
import { spawn } from './spawn'

import type { TtlCache } from './cache-with-ttl'
import type { SpawnOptions } from './spawn'

// GitHub API base URL constant (inlined for coverage mode compatibility).
const GITHUB_API_BASE_URL = 'https://api.github.com'

const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql'

// 5 minutes.
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000

// Create TTL cache instance for GitHub ref resolution.
// Uses cacache for persistent storage with in-memory memoization.
let _githubCache: TtlCache | undefined

/**
 * Thrown by `fetchGitHub` when GitHub returns HTTP 200 OK with a
 * zero-byte body — the "successful empty response" pattern.
 *
 * Why this exists (background for new contributors):
 *   GitHub's REST API has a documented failure mode that is *very*
 *   easy to miss in code review. During incidents where the search
 *   / Elasticsearch backing index is degraded (see GitHub status
 *   pages with titles like "search is degraded" or "Pull Requests
 *   degraded"), the REST `/repos/...` GET endpoints return:
 *     - HTTP status: 200 OK   ← looks like success
 *     - Body:        ""       ← but the payload is empty
 *     - Headers:     no Retry-After, no rate-limit signal, nothing
 *
 *   Without a typed error, calling code does
 *     `JSON.parse(response.body.toString('utf8'))`
 *   on an empty string, which throws a confusing
 *   `SyntaxError: Unexpected end of JSON input`. That error has
 *   nothing to do with our code — but it's the only signal upstream
 *   sees. This class wraps that case in a *named* error so callers
 *   can `instanceof GitHubEmptyBodyError` and choose what to do:
 *   retry the same endpoint later, fall back to GraphQL (which uses
 *   a different backend and is unaffected by ES outages), or surface
 *   a clean message to the user.
 *
 *   The HTTP status is hard-coded to 200 because that's *exactly*
 *   what makes this insidious — a real 4xx/5xx would already be
 *   handled by the rate-limit / status-code branch above.
 */
export class GitHubEmptyBodyError extends Error {
  /** HTTP status (always 200 — that's what makes this case insidious). */
  status: number
  constructor(url: string) {
    // Library-API error: terse and stable so callers can switch on
    // .name / instanceof without parsing the message. The verbose
    // background ("documented incident shape", status URL) lives in
    // the JSDoc above the class declaration.
    super(`GitHub API returned HTTP 200 with empty body: ${url}`)
    this.name = 'GitHubEmptyBodyError'
    this.status = 200
  }
}

/**
 * Options for GitHub API fetch requests.
 */
export interface GitHubFetchOptions {
  /**
   * GitHub authentication token.
   * If not provided, will attempt to use token from environment variables.
   */
  token?: string | undefined
  /**
   * Additional HTTP headers to include in the request.
   * Will be merged with default headers (Accept, User-Agent, Authorization).
   */
  headers?: Record<string, string> | undefined
}

/**
 * Error thrown when GitHub API rate limit is exceeded.
 * Extends the standard Error with additional rate limit information.
 */
export interface GitHubRateLimitError extends Error {
  /** HTTP status code (always 403 for rate limit errors) */
  status: number
  /**
   * Date when the rate limit will reset.
   * Undefined if reset time is not available in response headers.
   */
  resetTime?: Date | undefined
}

/**
 * GitHub ref object returned by the API.
 * Represents a git reference (tag or branch).
 */
export interface GitHubRef {
  /** The object this ref points to */
  object: {
    /** SHA of the commit or tag object */
    sha: string
    /** Type of object ('commit' or 'tag') */
    type: string
    /** API URL to fetch the full object details */
    url: string
  }
  /** Full ref path (e.g., 'refs/tags/v1.0.0' or 'refs/heads/main') */
  ref: string
  /** API URL for this ref */
  url: string
}

/**
 * GitHub annotated tag object returned by the API.
 * Represents a git tag with metadata.
 */
export interface GitHubTag {
  /** Tag annotation message */
  message: string
  /** The commit this tag points to */
  object: {
    /** SHA of the commit */
    sha: string
    /** Type of object (usually 'commit') */
    type: string
    /** API URL to fetch the commit details */
    url: string
  }
  /** SHA of this tag object itself */
  sha: string
  /** Tag name (e.g., 'v1.0.0') */
  tag: string
  /**
   * Information about who created the tag.
   * Undefined for lightweight tags.
   */
  tagger?: {
    /** Tag creation date in ISO 8601 format */
    date: string
    /** Tagger's email address */
    email: string
    /** Tagger's name */
    name: string
  }
  /** API URL for this tag object */
  url: string
}

/**
 * GitHub commit object returned by the API.
 * Represents a git commit with metadata.
 */
export interface GitHubCommit {
  /** Full commit SHA */
  sha: string
  /** API URL for this commit */
  url: string
  /** Commit details */
  commit: {
    /** Commit message */
    message: string
    /** Author information */
    author: {
      /** Commit author date in ISO 8601 format */
      date: string
      /** Author's email address */
      email: string
      /** Author's name */
      name: string
    }
  }
}

/**
 * Options for resolving git refs to commit SHAs.
 */
export interface ResolveRefOptions {
  /**
   * GitHub authentication token.
   * If not provided, will attempt to use token from environment variables.
   */
  token?: string | undefined
}

/**
 * GitHub Security Advisory (GHSA) details.
 * Represents a complete security advisory from GitHub's database.
 */
export interface GhsaDetails {
  /** GHSA identifier (e.g., 'GHSA-xxxx-yyyy-zzzz') */
  ghsaId: string
  /** Short summary of the vulnerability */
  summary: string
  /** Detailed description of the vulnerability */
  details: string
  /** Severity level ('low', 'moderate', 'high', 'critical') */
  severity: string
  /** Alternative identifiers (CVE IDs, etc.) */
  aliases: string[]
  /** ISO 8601 timestamp when advisory was published */
  publishedAt: string
  /** ISO 8601 timestamp when advisory was last updated */
  updatedAt: string
  /**
   * ISO 8601 timestamp when advisory was withdrawn.
   * `null` if advisory is still active.
   */
  withdrawnAt: string | null
  /** External reference URLs for more information */
  references: Array<{ url: string }>
  /** Affected packages and version ranges */
  vulnerabilities: Array<{
    /** Package information */
    package: {
      /** Ecosystem (e.g., 'npm', 'pip', 'maven') */
      ecosystem: string
      /** Package name */
      name: string
    }
    /** Version range expression for vulnerable versions */
    vulnerableVersionRange: string
    /**
     * First patched version that fixes the vulnerability.
     * `null` if no patched version exists yet.
     */
    firstPatchedVersion: { identifier: string } | null
  }>
  /**
   * CVSS (Common Vulnerability Scoring System) information.
   * `null` if CVSS score is not available.
   */
  cvss: {
    /** CVSS score (0.0-10.0) */
    score: number
    /** CVSS vector string describing the vulnerability characteristics */
    vectorString: string
  } | null
  /** CWE (Common Weakness Enumeration) categories */
  cwes: Array<{
    /** CWE identifier (e.g., 'CWE-79') */
    cweId: string
    /** Human-readable CWE name */
    name: string
    /** Description of the weakness category */
    description: string
  }>
}

/**
 * Fetch the SHA for a git ref from GitHub API.
 * Internal helper that implements the multi-strategy ref resolution logic.
 * Tries tags, branches, and direct commit lookups in sequence.
 *
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param ref - Git reference to resolve
 * @param options - Resolution options with authentication token
 * @returns The full commit SHA
 *
 * @throws {Error} When ref cannot be resolved after all strategies fail
 */
async function fetchRefSha(
  owner: string,
  repo: string,
  ref: string,
  options: ResolveRefOptions,
): Promise<string> {
  const fetchOptions: GitHubFetchOptions = {
    token: options.token,
  }

  // ---------------------------------------------------------------
  // Why this function has a "tier cascade" instead of a single call:
  //
  //   The user gives us a string `ref` and we don't know whether it
  //   names a tag (e.g. "v1.2.3"), a branch (e.g. "main"), or a raw
  //   commit SHA (e.g. "abc1234..."). REST has three different
  //   endpoints for these — there's no single "resolve any ref"
  //   endpoint — so we just try each in order: tag first (most
  //   common), then branch, then raw commit SHA. The first 200
  //   wins, the rest are skipped.
  //
  // Why we track `sawEmptyBody` separately from "this tier 404'd":
  //
  //   A real 404 means "this tier didn't match — keep walking" (e.g.
  //   "v1.2.3" isn't a branch, so the heads/v1.2.3 lookup 404s and
  //   we move on). But a `GitHubEmptyBodyError` means "GitHub itself
  //   is degraded right now and even a real match would return as
  //   if it didn't exist." Walking the tier cascade further when
  //   GitHub is down just multiplies the wasted calls — we'd 'fail'
  //   all three tiers, then either give up or fall back. By noting
  //   the empty-body signal in `sawEmptyBody`, we can fall through
  //   to a single GraphQL call after the cascade finishes that
  //   resolves all three forms in one shot via a different backend.
  //
  //   The `note404` name is a little unfortunate — it really tracks
  //   "the kind of error we just caught". But the semantic intent
  //   from the caller's perspective IS "this tier didn't match",
  //   which is what 404 means in the original cascade. Renaming
  //   would touch every catch site for limited gain.
  // ---------------------------------------------------------------
  let sawEmptyBody = false
  const note404 = (e: unknown): unknown => {
    if (e instanceof GitHubEmptyBodyError) {
      sawEmptyBody = true
    }
    return e
  }

  try {
    // Try as a tag first.
    const tagUrl = `${GITHUB_API_BASE_URL}/repos/${owner}/${repo}/git/refs/tags/${ref}`
    const tagData = await fetchGitHub<GitHubRef>(tagUrl, fetchOptions)

    // Tag might point to a tag object or directly to a commit.
    if (tagData.object.type === 'tag') {
      // Dereference the tag object to get the commit.
      const tagObject = await fetchGitHub<GitHubTag>(
        tagData.object.url,
        fetchOptions,
      )
      return tagObject.object.sha
    }
    return tagData.object.sha
  } catch (e) {
    note404(e)
    // Not a tag, try as a branch.
    try {
      const branchUrl = `${GITHUB_API_BASE_URL}/repos/${owner}/${repo}/git/refs/heads/${ref}`
      const branchData = await fetchGitHub<GitHubRef>(branchUrl, fetchOptions)
      return branchData.object.sha
    } catch (e2) {
      note404(e2)
      // Try without refs/ prefix (for commit SHAs or other refs).
      try {
        const commitUrl = `${GITHUB_API_BASE_URL}/repos/${owner}/${repo}/commits/${ref}`
        const commitData = await fetchGitHub<GitHubCommit>(
          commitUrl,
          fetchOptions,
        )
        return commitData.sha
      } catch (e3) {
        note404(e3)
        // -----------------------------------------------------------
        // If ANY of the three REST tiers hit the empty-body signal,
        // REST is degraded — fall back to GraphQL. GraphQL hits a
        // *different* backend at GitHub (not the same Elasticsearch
        // index as REST listings), so it stays consistent through
        // the kinds of incidents that produce empty REST bodies.
        //
        // We only fall back when `sawEmptyBody` is true. If all
        // three tiers genuinely 404'd (the ref really doesn't exist
        // anywhere — tag, branch, or commit), we DON'T trigger the
        // GraphQL call. That keeps the fallback narrow: it fires
        // only on the documented incident shape, not on every
        // "ref not found" outcome.
        //
        // If GraphQL ALSO fails (network error, GraphQL errors[],
        // etc.) we throw an informative "both transports failed"
        // error so the operator sees the cross-backend signal
        // rather than a bare last-tier REST error.
        // -----------------------------------------------------------
        if (sawEmptyBody) {
          let graphqlSha: string | undefined
          let graphqlErr: unknown
          try {
            graphqlSha = await fetchRefShaViaGraphQL(
              owner,
              repo,
              ref,
              fetchOptions,
            )
          } catch (cause) {
            graphqlErr = cause
          }
          if (graphqlSha) {
            return graphqlSha
          }
          if (graphqlErr !== undefined) {
            throw new ErrorCtor(
              `Failed to resolve ref "${ref}" for ${owner}/${repo}: both REST and GraphQL backends degraded`,
              { cause: graphqlErr },
            )
          }
          // GraphQL completed successfully but found no match — the ref
          // genuinely doesn't exist (or the empty-body signal happened
          // but GitHub has since recovered enough for GraphQL to confirm
          // the absence). Surface the cleaner "ref not found" message.
        }
        throw new ErrorCtor(
          `Failed to resolve ref "${ref}" for ${owner}/${repo}: ${errorMessage(e3)}`,
        )
      }
    }
  }
}

/**
 * Resolve a ref to its commit SHA via GraphQL.
 *
 * Why this function exists:
 *   This is the fallback that `fetchRefSha` calls when the REST
 *   tier-cascade detects the "GitHub returned 200 + empty body"
 *   incident shape. GraphQL hits a different backend than REST
 *   listings, so it stays consistent through the kinds of incidents
 *   that produce empty REST responses.
 *
 * What it does:
 *   The REST cascade needs three separate calls (tag, branch,
 *   commit) because REST has no single "resolve any ref" endpoint.
 *   GraphQL DOES — `Repository.ref(qualifiedName)` resolves
 *   tags AND branches by their fully-qualified name, and
 *   `Repository.object(oid)` resolves a raw commit SHA. We bundle
 *   all three into ONE query using GraphQL aliases (`tagRef`,
 *   `branchRef`, `commit`) and pick whichever resolved.
 *
 * Annotated vs lightweight tags:
 *   In Git, a "lightweight tag" is just a name that points directly
 *   at a commit. An "annotated tag" is a separate object (with
 *   tagger info, message, etc.) that itself points at the commit.
 *   GraphQL's `Tag.target` field gives us the commit SHA for
 *   annotated tags in one shot — REST needs a *second* HTTP call
 *   to dereference. The `... on Tag { target { oid } }` /
 *   `... on Commit { oid }` inline-fragments handle both shapes.
 *
 * Return contract:
 *   - Returns the SHA string when any form matches.
 *   - Returns `undefined` when the ref genuinely doesn't exist as a
 *     tag, branch, OR commit. The caller treats `undefined` the same
 *     as "REST cascade also failed" — a real "ref not found".
 *   - Returns `undefined` (not throws) on transport-level failures too:
 *     non-OK HTTP, empty GraphQL body, or JSON parse error. The
 *     REST cascade's "ref not found" message is more useful to the
 *     end user than a GraphQL transport error.
 */
async function fetchRefShaViaGraphQL(
  owner: string,
  repo: string,
  ref: string,
  options: GitHubFetchOptions,
): Promise<string | undefined> {
  const token = options.token || getGitHubToken()
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'socket-registry-github-client',
    ...options.headers,
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  // Resolve all three forms in one query. The `aliasName: ref(...)`
  // syntax assigns each lookup a stable key in the response so we
  // don't have to guess which one matched — we just check each
  // alias in priority order (tag → branch → commit) below.
  const query = `query($owner: String!, $repo: String!, $tag: String!, $branch: String!, $oid: GitObjectID!) {
    repository(owner: $owner, name: $repo) {
      tagRef: ref(qualifiedName: $tag) {
        target {
          __typename
          ... on Tag { target { oid } }
          ... on Commit { oid }
        }
      }
      branchRef: ref(qualifiedName: $branch) {
        target { oid }
      }
      commit: object(oid: $oid) {
        __typename
        ... on Commit { oid }
      }
    }
  }`
  // GraphQL's `oid` argument is a GitObjectID scalar — it must
  // syntactically look like a 40-character hex SHA, or the entire
  // GraphQL query is rejected as malformed BEFORE any resolution
  // happens. If the user passed a tag or branch name (which won't
  // match the SHA shape), we substitute the all-zeros SHA so the
  // query parses. The `commit:` alias then resolves to null (no
  // such commit), and we fall through to the tag/branch results.
  // Without this guard, calling `fetchRefShaViaGraphQL(..., 'main')`
  // would throw a confusing "Argument 'oid' on Field 'object' has
  // an invalid value" error and the tag/branch lookups never run.
  const looksLikeSha = /^[a-f0-9]{40}$/i.test(ref)
  const oidArg = looksLikeSha ? ref : '0000000000000000000000000000000000000000'
  const response = await httpRequest(GITHUB_GRAPHQL_URL, {
    body: JSONStringify({
      query,
      variables: {
        branch: `refs/heads/${ref}`,
        oid: oidArg,
        owner,
        repo,
        tag: `refs/tags/${ref}`,
      },
    }),
    headers,
    method: 'POST',
  })
  if (!response.ok || response.body.byteLength === 0) {
    // Either GraphQL itself failed (non-OK status) or it ALSO
    // returned an empty body — both backends are degraded. Return
    // undefined so the caller surfaces the original REST error rather
    // than re-throwing here. We deliberately don't recurse to
    // another transport because there isn't a third option.
    return undefined
  }
  let parsed: {
    data?: {
      repository?: {
        tagRef?: {
          target?:
            | { __typename: 'Tag'; target?: { oid: string } }
            | { __typename: 'Commit'; oid: string }
            | null
        } | null
        branchRef?: { target?: { oid: string } | null } | null
        commit?: { __typename?: string; oid?: string } | null
      } | null
    }
    errors?: Array<{ message: string }>
  }
  try {
    parsed = JSONParse(response.body.toString('utf8'))
  } catch {
    return undefined
  }
  // GraphQL has two ways of saying "no":
  //
  //   1. The aliased field comes back as `null` (e.g.
  //      `tagRef: null`). This is GraphQL's normal way of saying
  //      "the lookup ran but found nothing." It is NOT in the
  //      response's `errors[]` array — it's just a null in `data`.
  //   2. A genuine error (malformed query, repo doesn't exist,
  //      auth missing) shows up in the top-level `errors[]` array.
  //
  // For form-level "not found" we want behavior #1 — keep walking
  // the alias list. We only treat `errors[]` as a hard failure if
  // the entire `data.repository` came back null (e.g. wrong owner
  // / repo / private and we're unauthenticated).
  //
  // Walk the aliases in the SAME priority order as the REST
  // cascade (tag → branch → commit) so the function's behavior is
  // identical to REST when both backends return data.
  const repoData = parsed.data?.repository
  if (!repoData) {
    return undefined
  }
  const tagTarget = repoData.tagRef?.target
  if (tagTarget) {
    if (tagTarget.__typename === 'Tag') {
      return tagTarget.target?.oid ?? undefined
    }
    if (tagTarget.__typename === 'Commit') {
      return tagTarget.oid ?? undefined
    }
  }
  const branchOid = repoData.branchRef?.target?.oid
  if (branchOid) {
    return branchOid
  }
  if (repoData.commit?.__typename === 'Commit' && repoData.commit.oid) {
    return repoData.commit.oid
  }
  return undefined
}

/**
 * Get or create the GitHub cache instance.
 * Lazy initializes the cache with default TTL and memoization enabled.
 * Used internally for caching GitHub API responses.
 *
 * @returns The singleton cache instance
 */
function getGithubCache(): TtlCache {
  if (_githubCache === undefined) {
    _githubCache = createTtlCache({
      memoize: true,
      prefix: 'github-refs',
      ttl: DEFAULT_CACHE_TTL_MS,
    })
  }
  return _githubCache
}

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

  // Bypass cache if disabled.
  if (process.env['DISABLE_GITHUB_CACHE']) {
    return await fetchGhsaDetails(ghsaId, options)
  }

  // Use getOrFetch to prevent race conditions (thundering herd).
  return (await cache.getOrFetch(key, async () => {
    return await fetchGhsaDetails(ghsaId, options)
  })) as GhsaDetails
}

/**
 * Clear the ref resolution cache (in-memory only).
 * Clears the in-memory memoization cache without affecting the persistent disk cache.
 * Useful for testing or when you need fresh data from the API.
 *
 * Note: This only clears the in-memory cache. The persistent cacache storage
 * remains intact and will be used to rebuild the in-memory cache on next access.
 *
 * @returns Promise that resolves when cache is cleared
 *
 * @example
 * ```ts
 * // Clear cache to force fresh API calls
 * await clearRefCache()
 * const sha = await resolveRefToSha('owner', 'repo', 'main')
 * // This will hit the persistent cache or API, not in-memory cache
 * ```
 */
export async function clearRefCache(): Promise<void> {
  if (_githubCache) {
    await _githubCache.clear({ memoOnly: true })
  }
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
async function fetchGhsaDetailsViaGraphQL(
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
  if (!adv) {
    throw new ErrorCtor(`GHSA ${ghsaId} not found`)
  }
  return {
    ghsaId: adv.ghsaId,
    summary: adv.summary,
    details: adv.description,
    // REST returns severity lowercase ("moderate"); GraphQL uppercases
    // ("MODERATE"). Normalize so callers can compare against a single
    // canonical form regardless of which transport ran.
    severity: adv.severity.toLowerCase(),
    // REST `aliases` is the list of non-GHSA identifiers (CVE ids,
    // typically). GraphQL `identifiers` includes the advisory's own
    // GHSA id alongside CVE ids; filter it out to match REST shape.
    aliases:
      adv.identifiers?.filter(i => i.type !== 'GHSA').map(i => i.value) ?? [],
    publishedAt: adv.publishedAt,
    updatedAt: adv.updatedAt,
    withdrawnAt: adv.withdrawnAt ?? '',
    references: adv.references ?? [],
    vulnerabilities: adv.vulnerabilities?.nodes ?? [],
    cvss: adv.cvss ?? null,
    cwes: adv.cwes?.nodes ?? [],
  }
}

/**
 * Fetch data from GitHub API with automatic authentication and rate limit handling.
 * Makes authenticated requests to the GitHub REST API with proper error handling.
 *
 * Features:
 * - Automatic token injection from environment if not provided
 * - Rate limit detection with helpful error messages
 * - Standard GitHub API headers (Accept, User-Agent)
 * - JSON response parsing
 *
 * @template T - Expected response type (defaults to `unknown`)
 * @param url - Full GitHub API URL (e.g., 'https://api.github.com/repos/owner/repo')
 * @param options - Fetch options including token and custom headers
 * @returns Parsed JSON response of type `T`
 *
 * @throws {GitHubRateLimitError} When API rate limit is exceeded (status 403)
 * @throws {Error} For other API errors with status code and message
 *
 * @example
 * ```ts
 * // Fetch repository information
 * interface Repo {
 *   name: string
 *   full_name: string
 *   default_branch: string
 * }
 * const repo = await fetchGitHub<Repo>(
 *   'https://api.github.com/repos/owner/repo'
 * )
 * console.log(`Default branch: ${repo.default_branch}`)
 * ```
 *
 * @example
 * ```ts
 * // With custom token and headers
 * const data = await fetchGitHub(
 *   'https://api.github.com/user',
 *   {
 *     token: 'ghp_customtoken',
 *     headers: { 'X-Custom-Header': 'value' }
 *   }
 * )
 * ```
 *
 * @example
 * ```ts
 * // Handle rate limit errors
 * try {
 *   await fetchGitHub('https://api.github.com/repos/owner/repo')
 * } catch (e) {
 *   if (e.status === 403 && e.resetTime) {
 *     console.error(`Rate limited until ${e.resetTime}`)
 *   }
 * }
 * ```
 */
export async function fetchGitHub<T = unknown>(
  url: string,
  options?: GitHubFetchOptions | undefined,
): Promise<T> {
  const opts = { __proto__: null, ...options } as GitHubFetchOptions
  const token = opts.token || getGitHubToken()

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'socket-registry-github-client',
    ...opts.headers,
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  /* c8 ignore start - External GitHub API call */
  const response = await httpRequest(url, { headers })
  /* c8 ignore stop */

  if (!response.ok) {
    if (response.status === 403) {
      const rateLimit = response.headers['x-ratelimit-remaining']
      const rateLimitStr =
        typeof rateLimit === 'string' ? rateLimit : rateLimit?.[0]
      if (rateLimitStr === '0') {
        const resetTime = response.headers['x-ratelimit-reset']
        const resetTimeStr =
          typeof resetTime === 'string' ? resetTime : resetTime?.[0]
        const resetDate = resetTimeStr
          ? new DateCtor(Number(resetTimeStr) * 1000)
          : undefined
        const error = new ErrorCtor(
          `GitHub API rate limit exceeded${resetDate ? `. Resets at ${resetDate.toLocaleString()}` : ''}. Use GITHUB_TOKEN environment variable to increase rate limit.`,
        ) as GitHubRateLimitError
        error.status = 403
        error.resetTime = resetDate
        throw error
      }
    }
    throw new ErrorCtor(
      `GitHub API error ${response.status}: ${response.statusText}`,
    )
  }

  // 200 OK + zero-byte body is the documented GitHub incident shape
  // (Elasticsearch degraded → REST GETs return successful empty
  // responses). Surface as a typed error so callers can fall back to
  // GraphQL rather than parsing '' and throwing a confusing
  // SyntaxError. Without this guard `JSON.parse('')` blows up with
  // an unrelated "Unexpected end of JSON input" message that hides
  // the upstream cause.
  if (response.body.byteLength === 0) {
    throw new GitHubEmptyBodyError(url)
  }

  try {
    return JSONParse(response.body.toString('utf8')) as T
  } catch (e) {
    throw new ErrorCtor(
      `Failed to parse GitHub API response: ${errorMessage(e)}\n` +
        `URL: ${url}\n` +
        'Response may be malformed or incomplete.',
      { cause: e },
    )
  }
}

/**
 * Generate GitHub Security Advisory URL from GHSA ID.
 * Constructs the public advisory URL for a given GHSA identifier.
 *
 * @param ghsaId - GHSA identifier (e.g., 'GHSA-xxxx-yyyy-zzzz')
 * @returns Full URL to the advisory page
 *
 * @example
 * ```ts
 * const url = getGhsaUrl('GHSA-1234-5678-90ab')
 * console.log(url) // 'https://github.com/advisories/GHSA-1234-5678-90ab'
 * ```
 */
export function getGhsaUrl(ghsaId: string): string {
  return `https://github.com/advisories/${ghsaId}`
}

/**
 * Get GitHub authentication token from environment variables.
 * Checks multiple environment variable names in priority order.
 *
 * Environment variables checked (in order):
 * 1. `GITHUB_TOKEN` - Standard GitHub token variable
 * 2. `GH_TOKEN` - Alternative GitHub CLI token variable
 * 3. `SOCKET_CLI_GITHUB_TOKEN` - Socket-specific token variable
 *
 * @returns The first available GitHub token, or `undefined` if none found
 *
 * @example
 * ```ts
 * const token = getGitHubToken()
 * if (!token) {
 *   console.warn('No GitHub token found')
 * }
 * ```
 */
export function getGitHubToken(): string | undefined {
  return (
    getGithubToken() || getGhToken() || getSocketCliGithubToken() || undefined
  )
}

/**
 * Get GitHub authentication token from git config.
 * Reads the `github.token` configuration value from git config.
 * This is a fallback method when environment variables don't contain a token.
 *
 * @param options - Spawn options for git command execution
 * @returns GitHub token from git config, or `undefined` if not configured
 *
 * @example
 * ```ts
 * const token = await getGitHubTokenFromGitConfig()
 * if (token) {
 *   console.log('Found token in git config')
 * }
 * ```
 *
 * @example
 * ```ts
 * // With custom working directory
 * const token = await getGitHubTokenFromGitConfig({
 *   cwd: '/path/to/repo'
 * })
 * ```
 */
export async function getGitHubTokenFromGitConfig(
  options?: SpawnOptions | undefined,
): Promise<string | undefined> {
  /* c8 ignore start - External git process call */
  try {
    const result = await spawn('git', ['config', 'github.token'], {
      ...options,
      stdio: 'pipe',
    })
    if (result.code === 0 && result.stdout) {
      return result.stdout.toString().trim()
    }
  } catch {
    // Ignore errors - git config may not have token.
  }
  return undefined
  /* c8 ignore stop */
}

/**
 * Get GitHub authentication token from all available sources.
 * Checks environment variables first, then falls back to git config.
 * This is the recommended way to get a GitHub token with maximum compatibility.
 *
 * Priority order:
 * 1. Environment variables (GITHUB_TOKEN, GH_TOKEN, SOCKET_CLI_GITHUB_TOKEN)
 * 2. Git config (github.token)
 *
 * @returns GitHub token from first available source, or `undefined` if none found
 *
 * @example
 * ```ts
 * const token = await getGitHubTokenWithFallback()
 * if (!token) {
 *   throw new Error('GitHub token required')
 * }
 * ```
 */
export async function getGitHubTokenWithFallback(): Promise<
  string | undefined
> {
  return getGitHubToken() || (await getGitHubTokenFromGitConfig())
}

/**
 * Resolve a git ref (tag, branch, or commit SHA) to its full commit SHA.
 * Handles tags (annotated and lightweight), branches, and commit SHAs.
 * Results are cached in-memory and on disk (with TTL) to minimize API calls.
 *
 * Resolution strategy:
 * 1. Try as a tag (refs/tags/{ref})
 * 2. If tag is annotated, dereference to get the commit SHA
 * 3. If not a tag, try as a branch (refs/heads/{ref})
 * 4. If not a branch, try as a commit SHA directly
 *
 * Caching behavior:
 * - In-memory cache (Map) for immediate lookups
 * - Persistent disk cache (cacache) for durability across runs
 * - Default TTL: 5 minutes
 * - Disable caching with `DISABLE_GITHUB_CACHE` env var
 *
 * @param owner - Repository owner (user or organization name)
 * @param repo - Repository name
 * @param ref - Git reference to resolve (tag name, branch name, or commit SHA)
 * @param options - Resolution options including authentication token
 * @returns The full commit SHA (40-character hex string)
 *
 * @throws {Error} When ref cannot be resolved after trying all strategies
 * @throws {GitHubRateLimitError} When API rate limit is exceeded
 *
 * @example
 * ```ts
 * // Resolve a tag to commit SHA
 * const sha = await resolveRefToSha('owner', 'repo', 'v1.0.0')
 * console.log(sha) // 'a1b2c3d4e5f6...'
 * ```
 *
 * @example
 * ```ts
 * // Resolve a branch to latest commit SHA
 * const sha = await resolveRefToSha('owner', 'repo', 'main')
 * console.log(sha) // Latest commit on main branch
 * ```
 *
 * @example
 * ```ts
 * // Resolve with custom token
 * const sha = await resolveRefToSha(
 *   'owner',
 *   'repo',
 *   'develop',
 *   { token: 'ghp_customtoken' }
 * )
 * ```
 *
 * @example
 * ```ts
 * // Commit SHA passes through unchanged (but validates it exists)
 * const sha = await resolveRefToSha('owner', 'repo', 'a1b2c3d4')
 * console.log(sha) // Full 40-char SHA
 * ```
 */
export async function resolveRefToSha(
  owner: string,
  repo: string,
  ref: string,
  options?: ResolveRefOptions | undefined,
): Promise<string> {
  const opts = {
    __proto__: null,
    ...options,
  } as ResolveRefOptions

  const cacheKey = `${owner}/${repo}@${ref}`

  // Optionally disable cache.
  if (process.env['DISABLE_GITHUB_CACHE']) {
    return await fetchRefSha(owner, repo, ref, opts)
  }

  // Use TTL cache for persistent storage and in-memory memoization.
  const cache = getGithubCache()
  return await cache.getOrFetch(cacheKey, async () => {
    return await fetchRefSha(owner, repo, ref, opts)
  })
}
