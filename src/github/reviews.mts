/**
 * @file Update a SUBMITTED pull request review's body via GraphQL.
 *   Why this exists: GitHub's REST "update a review" endpoint
 *   (`PATCH /repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}`)
 *   only ever updates a review while it is still PENDING — the draft state
 *   before a reviewer (or a bot) clicks "submit". Call that endpoint against
 *   a review that has already been submitted (APPROVED, CHANGES_REQUESTED,
 *   COMMENTED) and GitHub answers 200 OK with the review's current JSON —
 *   indistinguishable from success — but the body on the PR is untouched.
 *   There is no error, no 4xx, nothing to catch. The only documented way to
 *   edit a SUBMITTED review's body is the GraphQL `updatePullRequestReview`
 *   mutation, which operates on the review regardless of submission state.
 *   Discovered the hard way on 2026-08-20: multiple agents, independently
 *   and in the same session, tried to shorten an already-submitted depscan
 *   PR review down to a terser format via the REST PATCH. Each one saw a
 *   200, moved on, and the review body never changed — the same dead end,
 *   rediscovered from scratch every time because nothing in this codebase
 *   said "REST can't do this." This module is that missing signpost.
 *   `updatePullRequestReviewBody` takes the review's GraphQL node_id
 *   directly, matching `updatePullRequestReview`'s own input shape. A caller
 *   that only has the REST numeric review id (the `id` field in a
 *   `GET .../reviews` listing) resolves it first with
 *   `getPullRequestReviewNodeId`.
 */

import { httpRequest } from '../http-request/request.mjs'
import { ErrorCtor } from '../primordials/error.mjs'
import { JSONParse, JSONStringify } from '../primordials/json.mjs'
import { fetchGitHub } from './request.mjs'
import { getGitHubToken } from './token.mjs'
import { GITHUB_GRAPHQL_URL } from './constants.mjs'
import { GitHubEmptyBodyError } from './errors.mjs'

import type { GitHubFetchOptions } from './types.mjs'

/**
 * Resolve a pull request review's GraphQL `node_id` from its REST numeric id.
 *
 * Why this is separate from `updatePullRequestReviewBody`: most callers land
 * on a review through a REST listing (`GET .../pulls/{pull_number}/reviews`),
 * which hands back the numeric `id` GitHub shows in its UI and CLI output —
 * not the opaque `node_id` GraphQL mutations require. This is the one extra
 * REST call that bridges the two id spaces, via
 * `GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}`, whose
 * response carries both ids side by side.
 *
 * @param owner - Repository owner, a user or organization name.
 * @param repo - Repository name.
 * @param pullNumber - Pull request number the review belongs to.
 * @param reviewId - The review's REST numeric id.
 * @param options - Fetch options including authentication token.
 *
 * @returns The review's GraphQL node_id.
 *
 * @throws {Error} If the review cannot be found or the API request fails.
 * @throws {GitHubRateLimitError} When the API rate limit is exceeded.
 */
export async function getPullRequestReviewNodeId(
  owner: string,
  repo: string,
  pullNumber: number,
  reviewId: number,
  options?: GitHubFetchOptions | undefined,
): Promise<string> {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/reviews/${reviewId}`
  const review = await fetchGitHub<{ node_id: string }>(url, options)
  return review.node_id
}

/**
 * Update a SUBMITTED pull request review's top-level body via the GraphQL
 * `updatePullRequestReview` mutation.
 *
 * Why GraphQL and not REST: see the file-level comment above — REST's update
 * endpoint silently no-ops once a review is submitted. This mutation has no
 * such restriction; it edits the body of a review in any state.
 *
 * Token handling mirrors `fetchGhsaDetailsViaGraphQL` /
 * `fetchRefShaViaGraphQL`: an explicit `options.token` wins, otherwise
 * `getGitHubToken()` resolves env → `git config`. GraphQL mutations always
 * require auth. There is no anonymous write path, so a caller relying on the
 * env/git-config fallback must have one of those set.
 *
 * @param nodeId - The review's GraphQL node_id (NOT the REST numeric id —
 *   resolve that first with `getPullRequestReviewNodeId` if that's all the
 *   caller has).
 * @param body - The new top-level review body (markdown).
 * @param options - Fetch options including authentication token.
 *
 * @returns The updated review's node_id, echoed back from the mutation
 *   response so a caller can confirm which review was touched.
 *
 * @throws {Error} If the mutation fails, the response is malformed, or
 *   GraphQL reports errors (e.g. an unknown or malformed node_id).
 */
export async function updatePullRequestReviewBody(
  nodeId: string,
  body: string,
  options?: GitHubFetchOptions | undefined,
): Promise<{ id: string }> {
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
  const query = `mutation($id: ID!, $body: String!) {
    updatePullRequestReview(input: { pullRequestReviewId: $id, body: $body }) {
      pullRequestReview { id }
    }
  }`
  const response = await httpRequest(GITHUB_GRAPHQL_URL, {
    body: JSONStringify({ query, variables: { body, id: nodeId } }),
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
    data?:
      | {
          updatePullRequestReview?:
            | { pullRequestReview?: { id: string } | null | undefined }
            | null
            | undefined
        }
      | undefined
    errors?: Array<{ message: string }> | undefined
  }
  try {
    parsed = JSONParse(response.body.toString('utf8'))
  } catch (cause) {
    throw new ErrorCtor(
      `Failed to parse GitHub GraphQL response for review ${nodeId}`,
      { cause },
    )
  }
  if (parsed.errors?.length) {
    throw new ErrorCtor(
      `GraphQL updatePullRequestReview(${nodeId}) returned errors: ${parsed.errors.map(e => e.message).join('; ')}`,
    )
  }
  const review = parsed.data?.updatePullRequestReview?.pullRequestReview
  // !review arm fires only when the node_id is unknown/malformed but
  // GraphQL still answers without an errors[] entry; tests seed a
  // successful mutation response.
  /* c8 ignore start */
  if (!review) {
    throw new ErrorCtor(
      `GraphQL updatePullRequestReview(${nodeId}) returned no review — ` +
        "check that the id is the review's node_id (not its REST numeric id)",
    )
  }
  /* c8 ignore stop */
  return { id: review.id }
}
