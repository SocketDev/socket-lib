/**
 * @file GitHub pull request merge-async REST helpers. The only merge
 *   endpoint that accepts stacked pull requests.
 */

// no-platform-http-import: server-only module merging PRs over node:http; node platform is intentional.
import { httpJson, HttpResponseError } from '../http-request/node.mjs'
import { GITHUB_API_BASE_URL } from './constants.mjs'
import { getGitHubToken } from './token.mjs'

/**
 * Fetch the current result for a UUID. `enqueued` is final for queue
 * requests; poll the merge-check endpoint for the eventual merge state.
 */
export async function getPullRequestMergeResult(
  config: GetPullRequestMergeResultConfig,
): Promise<PullRequestAsyncMergeResult> {
  const cfg = {
    __proto__: null,
    ...config,
  } as GetPullRequestMergeResultConfig
  const apiUrl = cfg.apiUrl ?? GITHUB_API_BASE_URL
  return await httpJson<PullRequestAsyncMergeResult>(
    `${apiUrl}/repos/${cfg.repo}/pulls/${cfg.pullNumber}/merge-async/${cfg.uuid}`,
    {
      headers: pullMergeHeaders(cfg.token),
      method: 'GET',
      timeout: 30_000,
    },
  )
}

/**
 * Standard headers: JSON accept/content-type, the API version the endpoint
 * ships in, and a Bearer token when one resolves.
 */
export function pullMergeHeaders(
  token?: string | undefined,
): Record<string, string> {
  const resolved = token ?? getGitHubToken()
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'content-type': 'application/json',
    'x-github-api-version': '2026-03-10',
  }
  if (resolved) {
    headers['authorization'] = `Bearer ${resolved}`
  }
  return headers
}

export type PullRequestAsyncMergeStatus =
  | 'pending'
  | 'merged'
  | 'enqueued'
  | 'failed'

export type PullRequestMergeAction = 'default' | 'direct_merge' | 'merge_queue'

export type PullRequestMergeMethod = 'merge' | 'squash' | 'rebase'

export interface PullRequestMergePendingDetails {
  readonly bypassRules?: boolean | undefined
  readonly expectedHeadSha: string
  readonly mergeAction: 'default' | 'merge_queue' | 'direct_merge'
  readonly mergeMethod: 'default' | 'merge' | 'squash' | 'rebase'
  readonly message: string
  readonly uuid: string
}

export interface PullRequestMergeMergedDetails {
  readonly message: string
  readonly sha: string
}

export interface PullRequestMergeMessageDetails {
  readonly message: string
}

export type PullRequestMergeDetails =
  | PullRequestMergePendingDetails
  | PullRequestMergeMergedDetails
  | PullRequestMergeMessageDetails

export interface PullRequestAsyncMergeResult {
  readonly details: PullRequestMergeDetails
  readonly status: PullRequestAsyncMergeStatus
}

export interface RequestPullRequestMergeConfig {
  /**
   * Override the API origin (GitHub Enterprise / tests).
   */
  readonly apiUrl?: string | undefined
  /**
   * Whether to bypass repository rules the authenticated actor may bypass.
   */
  readonly bypassRules?: boolean | undefined
  /**
   * Extra commit-message detail. Direct merges only.
   */
  readonly commitMessage?: string | undefined
  /**
   * Automatic commit-message title. Direct merges only.
   */
  readonly commitTitle?: string | undefined
  /**
   * `direct_merge` skips a configured queue, `merge_queue` requires one,
   * `default` uses a queue when the target branch has one.
   */
  readonly mergeAction?: PullRequestMergeAction | undefined
  /**
   * The merge method. Direct merges only.
   */
  readonly mergeMethod?: PullRequestMergeMethod | undefined
  /**
   * Pull request number to merge.
   */
  readonly pullNumber: number
  /**
   * Repo in "owner/name" form.
   */
  readonly repo: string
  /**
   * SHA the PR head must match. When omitted, GitHub pins the head at
   * request time and cancels the merge if the PR moves.
   */
  readonly sha?: string | undefined
  /**
   * GitHub token with contents:write. Falls back to `getGitHubToken()`
   * (env → `git config` → `gh`) when omitted.
   */
  readonly token?: string | undefined
}

export type GetPullRequestMergeResultConfig = Omit<
  RequestPullRequestMergeConfig,
  | 'bypassRules'
  | 'commitMessage'
  | 'commitTitle'
  | 'mergeAction'
  | 'mergeMethod'
  | 'sha'
> & {
  readonly uuid: string
}

/**
 * Request an async merge: `pending` (202 or 409), `merged`, or `enqueued`.
 * A 400/403/404/422 throws `HttpResponseError`; rule violations fail later.
 */
export async function requestPullRequestMerge(
  config: RequestPullRequestMergeConfig,
): Promise<PullRequestAsyncMergeResult> {
  const cfg = { __proto__: null, ...config } as RequestPullRequestMergeConfig
  const apiUrl = cfg.apiUrl ?? GITHUB_API_BASE_URL
  const body: Record<string, unknown> = { __proto__: null }
  if (cfg.bypassRules !== undefined) {
    body['bypass_rules'] = cfg.bypassRules
  }
  if (cfg.commitMessage !== undefined) {
    body['commit_message'] = cfg.commitMessage
  }
  if (cfg.commitTitle !== undefined) {
    body['commit_title'] = cfg.commitTitle
  }
  if (cfg.mergeAction !== undefined) {
    body['merge_action'] = cfg.mergeAction
  }
  if (cfg.mergeMethod !== undefined) {
    body['merge_method'] = cfg.mergeMethod
  }
  if (cfg.sha !== undefined) {
    body['sha'] = cfg.sha
  }
  const url = `${apiUrl}/repos/${cfg.repo}/pulls/${cfg.pullNumber}/merge-async`
  try {
    return await httpJson<PullRequestAsyncMergeResult>(url, {
      body: JSON.stringify(body),
      headers: pullMergeHeaders(cfg.token),
      method: 'PUT',
      timeout: 30_000,
    })
  } catch (e) {
    if (e instanceof HttpResponseError && e.response.status === 409) {
      return e.response.json<PullRequestAsyncMergeResult>()
    }
    throw e
  }
}
