/**
 * @file Resolve a GitHub git ref via REST tier-cascade. Split out of
 *   `github/refs.ts` for size hygiene. Walks tag → branch → commit endpoints in
 *   sequence; the first 200 OK wins. If any tier hits the documented
 *   200-OK-empty-body incident shape, falls back to the GraphQL transport in
 *   `./refs-graphql`.
 */

import { errorMessage } from '../errors/message'

import { ErrorCtor } from '../primordials/error'

import { fetchGitHub } from './request'
import { fetchRefShaViaGraphQL } from './refs-graphql'
import { GITHUB_API_BASE_URL } from './constants'
import { GitHubEmptyBodyError } from './errors'

import type {
  GitHubCommit,
  GitHubFetchOptions,
  GitHubRef,
  GitHubTag,
  ResolveRefOptions,
} from './types'

/**
 * Fetch the SHA for a git ref from GitHub API. Internal helper that implements
 * the multi-strategy ref resolution logic. Tries tags, branches, and direct
 * commit lookups in sequence.
 *
 * @param owner - Repository owner.
 * @param repo - Repository name.
 * @param ref - Git reference to resolve.
 * @param options - Resolution options with authentication token.
 *
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
