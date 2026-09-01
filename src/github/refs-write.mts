/**
 * @file GitHub git-refs REST write helpers — create, fast-forward, and delete
 *   a branch ref, plus tag creation. The read-side cascade lives in
 *   `./refs-rest`; this module owns the mutations a release pipeline needs:
 *   bump commits land on a throwaway branch, and only a SUCCESSFUL publish
 *   fast-forwards the default branch to that branch tip (same SHA) then
 *   deletes it. A rejected publish deletes the branch, so the default branch
 *   never sees the bump — no version creep, and no direct write to a
 *   branch-protected default. `httpJson` throws `HttpResponseError` on
 *   non-2xx and JSON-parses the body; a `DELETE` ref returns 204 with an
 *   empty body, so that path uses `httpText`. All three go over node:http, so
 *   nock intercepts them in tests. Auth matches `./request`: an explicit
 *   `token` wins, else `getGitHubToken()` resolves env → `git config`.
 */

// no-platform-http-import: server-only module writing GitHub refs over node:http; node platform is intentional.
import { httpJson, HttpResponseError, httpText } from '../http-request/node.mjs'
import { GITHUB_API_BASE_URL } from './constants.mjs'
import { getGitHubToken } from './token.mjs'

/**
 * Create `refs/heads/<branch>` pointing at `sha`. Throws `HttpResponseError`
 * on a non-2xx response — including 422 when the ref already exists (the
 * caller decides whether to force-update it instead).
 */
export async function createBranchRef(
  config: CreateOrUpdateRefConfig,
): Promise<void> {
  const cfg = { __proto__: null, ...config } as CreateOrUpdateRefConfig
  const apiUrl = cfg.apiUrl ?? GITHUB_API_BASE_URL
  await httpJson(`${apiUrl}/repos/${cfg.repo}/git/refs`, {
    body: JSON.stringify({ ref: `refs/heads/${cfg.branch}`, sha: cfg.sha }),
    headers: refWriteHeaders(cfg.token),
    method: 'POST',
    timeout: 30_000,
  })
}

/**
 * Create `refs/tags/<tag>` pointing at `sha`. A release stage's tag push can
 * run in a checkout with `persist-credentials: false`, where a plain
 * `git push origin <tag>` has no credential and exits 128 — this API route
 * uses the same token the branch-based bump already holds, so the tag lands
 * even when git itself cannot push. Throws `HttpResponseError` on a non-2xx
 * response — including 422 when the tag already exists (the caller treats an
 * existing tag as success via its own ls-remote check).
 */
export async function createTagRef(config: CreateTagRefConfig): Promise<void> {
  const cfg = { __proto__: null, ...config } as CreateTagRefConfig
  const apiUrl = cfg.apiUrl ?? GITHUB_API_BASE_URL
  await httpJson(`${apiUrl}/repos/${cfg.repo}/git/refs`, {
    body: JSON.stringify({ ref: `refs/tags/${cfg.tag}`, sha: cfg.sha }),
    headers: refWriteHeaders(cfg.token),
    method: 'POST',
    timeout: 30_000,
  })
}

/**
 * Delete `refs/heads/<branch>`. Idempotent: a 404/422 — the ref is already
 * gone — is swallowed so cleanup after a failed or re-run publish never
 * itself throws. Any other non-2xx (e.g. 401/403 auth) propagates.
 */
export async function deleteBranchRef(config: GitRefConfig): Promise<void> {
  const cfg = { __proto__: null, ...config } as GitRefConfig
  const apiUrl = cfg.apiUrl ?? GITHUB_API_BASE_URL
  try {
    await httpText(`${apiUrl}/repos/${cfg.repo}/git/refs/heads/${cfg.branch}`, {
      headers: refWriteHeaders(cfg.token),
      method: 'DELETE',
      timeout: 30_000,
    })
  } catch (e) {
    const status =
      e instanceof HttpResponseError ? e.response.status : undefined
    if (status !== 404 && status !== 422) {
      throw e
    }
  }
}

export interface GitRefConfig {
  /**
   * Override the API origin (GitHub Enterprise / tests). Defaults to
   * `GITHUB_API_BASE_URL`.
   */
  readonly apiUrl?: string | undefined
  /**
   * Short branch name without the `refs/heads/` prefix (e.g.
   * 'npm-publish-v1.4.3').
   */
  readonly branch: string
  /**
   * Repo in "owner/name" form.
   */
  readonly repo: string
  /**
   * GitHub token with contents:write. Falls back to `getGitHubToken()`
   * (env → `git config`) when omitted, matching `fetchGitHub`.
   */
  readonly token?: string | undefined
}

export interface CreateOrUpdateRefConfig extends GitRefConfig {
  /**
   * Optional for `updateBranchRef`: allow a non-fast-forward advance.
   * Defaults to false so GitHub rejects (422) anything that would rewrite
   * history.
   */
  readonly force?: boolean | undefined
  /**
   * Commit SHA the ref should point at.
   */
  readonly sha: string
}

export interface CreateTagRefConfig {
  /**
   * Override the API origin (GitHub Enterprise / tests). Defaults to
   * `GITHUB_API_BASE_URL`.
   */
  readonly apiUrl?: string | undefined
  /**
   * Repo in "owner/name" form.
   */
  readonly repo: string
  /**
   * Commit SHA the tag should mark.
   */
  readonly sha: string
  /**
   * Short tag name without the `refs/tags/` prefix, e.g. 'v1.4.3'.
   */
  readonly tag: string
  /**
   * GitHub token with contents:write. Falls back to `getGitHubToken()` when
   * omitted.
   */
  readonly token?: string | undefined
}

/**
 * The standard headers for a git-refs write: JSON accept/content-type, the
 * pinned REST API version, and a Bearer authorization when a token resolves.
 */
export function refWriteHeaders(
  token?: string | undefined,
): Record<string, string> {
  const resolved = token ?? getGitHubToken()
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'content-type': 'application/json',
    'x-github-api-version': '2022-11-28',
  }
  if (resolved) {
    headers['authorization'] = `Bearer ${resolved}`
  }
  return headers
}

/**
 * Advance `refs/heads/<branch>` to `sha`. With `force` false, the default, a
 * non-fast-forward advance is rejected by GitHub (422) — the fast-forward is
 * what lets the default branch inherit the release branch's exact commit SHA.
 * Throws `HttpResponseError` on any non-2xx response.
 */
export async function updateBranchRef(
  config: CreateOrUpdateRefConfig,
): Promise<void> {
  const cfg = { __proto__: null, ...config } as CreateOrUpdateRefConfig
  const apiUrl = cfg.apiUrl ?? GITHUB_API_BASE_URL
  await httpJson(`${apiUrl}/repos/${cfg.repo}/git/refs/heads/${cfg.branch}`, {
    body: JSON.stringify({ force: cfg.force ?? false, sha: cfg.sha }),
    headers: refWriteHeaders(cfg.token),
    method: 'PATCH',
    timeout: 30_000,
  })
}
