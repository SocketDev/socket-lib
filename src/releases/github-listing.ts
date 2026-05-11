/**
 * @fileoverview GitHub release listing via REST + GraphQL.
 *
 * Split out of `releases/github-api.ts` for size hygiene. Holds the
 * "list all releases for a repo" path (both transports + the
 * latest-matching-tag picker that composes them):
 *
 *   - `fetchReleasesViaRest` — canonical REST `/releases?per_page=100` listing
 *   - `fetchReleasesViaGraphQL` — GraphQL fallback when REST's ES index is degraded
 *   - `getLatestRelease` — REST → GraphQL fallback + prefix/asset filter
 *
 * The per-tag asset-URL lookup lives in `./github-asset-url`.
 */

import { httpRequest } from '../http-request/request'
import { pRetry } from '../promises/retry'

import { ArrayIsArray } from '../primordials/array'
import { DateParse } from '../primordials/date'
import { ErrorCtor } from '../primordials/error'
import { JSONParse, JSONStringify } from '../primordials/json'
import { ObjectFreeze } from '../primordials/object'
import { StringPrototypeStartsWith } from '../primordials/string'

import { createAssetMatcher } from './github-assets'
import { getAuthHeaders } from './github-auth'

import type { AssetPattern, RepoConfig } from './github-types'

/**
 * Retry configuration for GitHub API requests.
 * Uses exponential backoff to handle transient failures and rate limiting.
 */
const RETRY_CONFIG = ObjectFreeze({
  __proto__: null,
  // Exponential backoff: delay doubles with each retry (5s, 10s, 20s).
  backoffFactor: 2,
  // Initial delay before first retry.
  baseDelayMs: 5000,
  // Maximum number of retry attempts (excluding initial request).
  retries: 2,
})

/**
 * Internal release row shape used by the listing helpers and the
 * filter pipeline in `getLatestRelease`. Both REST and GraphQL paths
 * normalize their output to this shape so downstream code is unaware
 * of which transport produced the data.
 */
interface ReleaseRow {
  tag_name: string
  published_at: string
  assets: Array<{ name: string }>
}

/**
 * Fetch the latest 100 releases for a repo via GraphQL.
 *
 * Why this exists:
 *   `fetchReleasesViaRest` can return `[]` for two reasons (real
 *   empty repo vs. GitHub-incident-degraded backend). When REST
 *   returns nothing, the caller in `getLatestRelease` calls THIS
 *   to disambiguate — if we return >0 here, REST was lying.
 *
 * Field shape diffs we normalize:
 *   GraphQL returns       REST equivalent      Why they differ
 *   `tagName`             `tag_name`           camelCase vs. snake_case
 *   `publishedAt`         `published_at`       camelCase vs. snake_case
 *   `releaseAssets.nodes` `assets`             GraphQL connection
 *                                              wrapper unwrapped
 *
 *   We re-shape inside the `.map(...)` at the bottom so callers
 *   downstream can use the SAME code path regardless of which
 *   transport ran.
 *
 * Why we hit a different backend:
 *   GraphQL queries don't go through the same Elasticsearch index
 *   that REST listings rely on. During incidents that drop the ES
 *   index (or its connectivity), GraphQL's `repository.releases`
 *   connection keeps working because it reads from a different
 *   data path inside GitHub. That's the entire reason this
 *   fallback exists.
 */
export async function fetchReleasesViaGraphQL(
  owner: string,
  repo: string,
): Promise<ReleaseRow[]> {
  const response = await httpRequest('https://api.github.com/graphql', {
    body: JSONStringify({
      query: `query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          releases(first: 100, orderBy: {field: CREATED_AT, direction: DESC}) {
            nodes {
              tagName
              publishedAt
              releaseAssets(first: 100) { nodes { name } }
            }
          }
        }
      }`,
      variables: { owner, repo },
    }),
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
    method: 'POST',
  })
  if (!response.ok) {
    throw new ErrorCtor(
      `Failed to fetch ${owner}/${repo} releases (GraphQL): ${response.status}`,
    )
  }
  let parsed: {
    data?: {
      repository?: {
        releases?: {
          nodes?: Array<{
            tagName: string
            publishedAt: string
            releaseAssets?: { nodes?: Array<{ name: string }> }
          }>
        }
      }
    }
    errors?: Array<{ message: string }>
  }
  try {
    parsed = JSONParse(response.body.toString('utf8'))
  } catch (cause) {
    throw new ErrorCtor(
      `Failed to parse GitHub GraphQL response for ${owner}/${repo} releases`,
      { cause },
    )
  }
  // errors-array arm fires only when GraphQL returns errors;
  // empty-array fallbacks for missing repository/releases/nodes/
  // releaseAssets are defensive against minimal API responses.
  /* c8 ignore start */
  if (parsed.errors?.length) {
    throw new ErrorCtor(
      `GraphQL repository.releases(${owner}/${repo}) returned errors: ${parsed.errors.map(e => e.message).join('; ')}`,
    )
  }
  return (parsed.data?.repository?.releases?.nodes ?? []).map(n => ({
    tag_name: n.tagName,
    published_at: n.publishedAt,
    assets: n.releaseAssets?.nodes ?? [],
  }))
  /* c8 ignore stop */
}

/**
 * Fetch the latest 100 releases for a repo via REST.
 *
 * Why this returns `[]` on TWO different cases:
 *   - HTTP 200 + zero-byte body. This is the documented GitHub
 *     "search degraded" incident shape (see status.github.com).
 *     The releases listing endpoint shares an Elasticsearch index
 *     with search; when that ES is degraded, `/releases` returns
 *     a successful 200 OK but with NO BODY. There's no error code,
 *     no Retry-After, no rate-limit header — just an empty payload.
 *   - HTTP 200 + literal `[]`. This is the *normal* "the repo has
 *     no releases" response — say a brand-new repo with no
 *     published versions.
 *
 *   Both produce the same `[]` here because the helper can't tell
 *   them apart without context. The CALLER (getLatestRelease) does
 *   the cross-check: if REST returns `[]`, query GraphQL once. If
 *   GraphQL also returns `[]`, the repo really is empty. If it
 *   returns >0, REST was lying and we use GraphQL's answer.
 *
 * Why we throw on non-OK status:
 *   `pRetry` wraps this call and retries on thrown errors with
 *   exponential backoff. A 5xx is transient and worth retrying;
 *   we want it to throw so pRetry can do its job. Empty body is
 *   NOT thrown because pRetry can't help — a 200 OK is "done" as
 *   far as retry policy is concerned.
 */
export async function fetchReleasesViaRest(
  owner: string,
  repo: string,
): Promise<ReleaseRow[]> {
  const response = await httpRequest(
    `https://api.github.com/repos/${owner}/${repo}/releases?per_page=100`,
    { headers: getAuthHeaders() },
  )
  if (!response.ok) {
    throw new ErrorCtor(
      `Failed to fetch ${owner}/${repo} releases: ${response.status}`,
    )
  }
  const text = response.body.toString('utf8')
  if (text.length === 0) {
    // 200 OK + empty body — the documented GitHub-search-degraded
    // signature. Return [] so the caller can decide whether to fall
    // back rather than throwing (we don't want pRetry to burn
    // attempts on a known incident shape).
    return []
  }
  let parsed: unknown
  try {
    parsed = JSONParse(text)
  } catch (cause) {
    throw new ErrorCtor(`Failed to parse ${owner}/${repo} releases response`, {
      cause,
    })
  }
  // Empty-array fallback fires only if GraphQL returns non-array body.
  /* c8 ignore start */
  return ArrayIsArray(parsed) ? (parsed as ReleaseRow[]) : []
  /* c8 ignore stop */
}

/**
 * Get latest release tag matching a tool prefix.
 * Optionally filter by releases containing a matching asset.
 *
 * @param toolPrefix - Tool name prefix to search for (e.g., 'node-smol-')
 * @param repoConfig - Repository configuration (owner/repo)
 * @param options - Additional options
 * @param options.assetPattern - Optional pattern to filter releases by matching asset
 * @param options.nothrow - If true, return undefined instead of throwing when both REST and GraphQL backends are degraded. Default: false.
 * @returns Latest release tag or undefined if not found
 * @throws {Error} If both REST and GraphQL backends are degraded and nothrow is false.
 *
 * @example
 * ```typescript
 * const tag = await getLatestRelease('lief-', {
 *   owner: 'SocketDev', repo: 'socket-btm',
 * })
 * console.log(tag) // 'lief-2025-01-15-abc1234'
 * ```
 */
export async function getLatestRelease(
  toolPrefix: string,
  repoConfig: RepoConfig,
  options: {
    assetPattern?: AssetPattern
    nothrow?: boolean
  } = {},
): Promise<string | undefined> {
  // The `quiet` option from previous releases is no longer accepted.
  // The helper is silent by design now (errors throw, success
  // returns) so there's nothing for the caller to suppress. Type
  // enforces this — passing `{ quiet: true }` is a TS error.
  const { assetPattern, nothrow = false } = options
  const { owner, repo } = repoConfig

  // Create matcher function if pattern provided.
  const isMatch = assetPattern ? createAssetMatcher(assetPattern) : undefined

  return (
    (await pRetry(async () => {
      // Fetch via REST first. The REST endpoint is the canonical
      // listing path and is what we want to use when GitHub is
      // healthy. During GitHub Elasticsearch outages (which back the
      // releases listing index) REST can return HTTP 200 with an
      // empty array even when the repo has dozens of releases — see
      // https://www.githubstatus.com incidents tagged "search is
      // degraded". When that happens we fall back to GraphQL, which
      // hits a different backend and stays consistent through ES
      // outages. Per-tag fetches in `getReleaseAssetUrl` go through
      // `/repos/:owner/:repo/releases/tags/:tag` which is unaffected
      // by the listing-index outage, so that helper stays on REST.
      let releases = await fetchReleasesViaRest(owner, repo)
      if (releases.length === 0) {
        // Empty REST response is ambiguous: it could mean the repo
        // genuinely has no releases, or GitHub's listing index is
        // degraded. Cross-check against GraphQL once. If GraphQL
        // also returns 0, the repo really is empty and we report
        // "no match"; if GraphQL returns >0, REST was lying and
        // we silently use the GraphQL result — the caller asked
        // for releases, the helper got them, the transport diff
        // isn't actionable for the user. If GraphQL throws, wrap
        // with a "both transports failed" message so the operator
        // sees the cross-backend signal rather than a bare GraphQL
        // error that looks like an unrelated failure.
        let graphqlReleases: ReleaseRow[]
        try {
          graphqlReleases = await fetchReleasesViaGraphQL(owner, repo)
        } catch (cause) {
          // Library-API error: terse, stable. The verbose
          // explanation lives in the JSDoc / README; callers
          // asserting on .message need a short canonical form.
          // `nothrow: true` callers get undefined (treated as "no
          // releases found") instead of the throw — matches the
          // bin.ts whichReal convention.
          /* c8 ignore next 7 - REST + GraphQL both-degraded branch
             requires both real backends to fail simultaneously. */
          if (nothrow) {
            return undefined
          }
          throw new ErrorCtor(
            `Failed to list ${owner}/${repo} releases: both REST and GraphQL backends degraded`,
            { cause },
          )
        }
        if (graphqlReleases.length > 0) {
          releases = graphqlReleases
        }
      }

      // Filter releases matching the tool prefix.
      const matchingReleases = releases.filter(release => {
        const { assets, tag_name: tag } = release
        if (!StringPrototypeStartsWith(tag, toolPrefix)) {
          return false
        }

        // Skip releases with no assets (empty releases).
        if (!assets || assets.length === 0) {
          return false
        }

        // If asset pattern provided, check if release has matching asset.
        if (isMatch) {
          const hasMatchingAsset = assets.some((a: { name: string }) =>
            isMatch(a.name),
          )
          if (!hasMatchingAsset) {
            return false
          }
        }

        return true
      })

      if (matchingReleases.length === 0) {
        return undefined
      }

      // Sort by published_at descending (newest first).
      // GitHub API doesn't guarantee order, so we must sort explicitly.
      // DateParse returns the epoch ms for an ISO 8601 string, which
      // is what we'd get from `new Date(s).getTime()` but with one
      // less object allocation per comparison.
      matchingReleases.sort(
        (a: { published_at: string }, b: { published_at: string }) =>
          DateParse(b.published_at) - DateParse(a.published_at),
      )

      const latestRelease = matchingReleases[0]!
      return latestRelease.tag_name
    }, RETRY_CONFIG)) ?? undefined
  )
}
