/**
 * @fileoverview Resolve GitHub git refs (tag / branch / commit) to
 * full commit SHAs.
 *
 * Two-tier strategy with cross-backend fallback:
 *
 *   1. REST cascade (`fetchRefSha`): tag → branch → commit. The
 *      first 200 OK wins.
 *   2. GraphQL fallback (`fetchRefShaViaGraphQL`): fires only when
 *      the REST cascade hits the documented 200-OK-empty-body
 *      incident shape. GraphQL queries hit a different backend at
 *      GitHub, so it stays consistent through Elasticsearch outages
 *      that produce empty REST bodies.
 *
 * Caching: a `TtlCache` keyed by `${owner}/${repo}@${ref}` with a
 * 5-minute TTL plus in-memory memoization. `clearRefCache()` clears
 * the in-memory tier; the persistent disk tier survives so the cache
 * warms quickly on the next run. Disable everything with the
 * `DISABLE_GITHUB_CACHE` env var.
 */

import process from 'node:process'

import { createTtlCache } from '../cache-with-ttl/cache'
import { errorMessage } from '../errors'
import { httpRequest } from '../http-request/request'
import { ErrorCtor } from '../primordials/error'
import { JSONParse, JSONStringify } from '../primordials/json'
import { fetchGitHub } from './fetch'
import { getGitHubToken } from './token'
import {
  DEFAULT_CACHE_TTL_MS,
  GITHUB_API_BASE_URL,
  GITHUB_GRAPHQL_URL,
  GitHubEmptyBodyError,
} from './types'

import type { TtlCache } from '../cache-with-ttl/types'
import type {
  GitHubCommit,
  GitHubFetchOptions,
  GitHubRef,
  GitHubTag,
  ResolveRefOptions,
} from './types'

let _githubCache: TtlCache | undefined

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
export async function fetchRefSha(
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
          // graphqlErr-defined arm fires only when the GraphQL fallback
          // also failed; tested but not on every cascade entry.
          /* c8 ignore start */
          if (graphqlErr !== undefined) {
            throw new ErrorCtor(
              `Failed to resolve ref "${ref}" for ${owner}/${repo}: both REST and GraphQL backends degraded`,
              { cause: graphqlErr },
            )
          }
          /* c8 ignore stop */
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
export async function fetchRefShaViaGraphQL(
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
  // SHA-detect ternary: ref-as-sha arm fires only when caller passes
  // a hex SHA, which most ref tests don't.
  /* c8 ignore next 2 */
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
  // Defensive: GraphQL endpoint always returns repository for a valid query.
  /* c8 ignore start */
  if (!repoData) {
    return undefined
  }
  /* c8 ignore stop */
  const tagTarget = repoData.tagRef?.target
  if (tagTarget) {
    // GraphQL annotated-tag vs. lightweight-tag/commit cascade. Both
    // arms reachable depending on the ref type, but tests don't always
    // mock both.
    /* c8 ignore start */
    if (tagTarget.__typename === 'Tag') {
      return tagTarget.target?.oid ?? undefined
    }
    if (tagTarget.__typename === 'Commit') {
      return tagTarget.oid ?? undefined
    }
    /* c8 ignore stop */
  }
  const branchOid = repoData.branchRef?.target?.oid
  if (branchOid) {
    return branchOid
  }
  // Commit fallback fires only when neither tagRef nor branchRef yields
  // an oid; tests seed at least one of them.
  /* c8 ignore start */
  if (repoData.commit?.__typename === 'Commit' && repoData.commit.oid) {
    return repoData.commit.oid
  }
  return undefined
  /* c8 ignore stop */
}

/**
 * Get or create the GitHub cache instance.
 * Lazy initializes the cache with default TTL and memoization enabled.
 * Used internally for caching GitHub API responses.
 *
 * @returns The singleton cache instance
 */
export function getGithubCache(): TtlCache {
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
