/**
 * @file Create a SIGNED commit on a branch via the GitHub git-objects API
 *   (blob -> tree -> commit -> ref PATCH). Commits created through the API are
 *   web-flow-verified ("Verified" / signed) without a local GPG or SSH signing
 *   key — the only way CI can land a commit on a branch whose protection
 *   requires signed commits. Built on `github/request` (`fetchGitHub`) and the
 *   `github/token` resolver for auth/retry/error consistency.
 */

import { JSONStringify } from '../primordials/json'
import { getGitHubToken } from './token'
import { GITHUB_API_BASE_URL } from './constants'

// oxlint-disable-next-line socket/no-platform-specific-import -- node-only module; http-request/request is the correct internal path.
import { httpRequest } from '../http-request/request'

/**
 * A single file to include in the signed commit.
 */
export interface CommitFile {
  /**
   * UTF-8 text contents to write at `path`.
   */
  readonly content: string
  /**
   * Repo-relative path, POSIX separators (e.g. 'package.json').
   */
  readonly path: string
}

/**
 * Options for `createSignedCommit`.
 */
export interface CreateSignedCommitOptions {
  /**
   * Override the API origin (GitHub Enterprise or tests). Defaults to
   * https://api.github.com.
   */
  readonly apiUrl?: string | undefined
  /**
   * SHA of the tree to layer the new files onto (usually `HEAD^{tree}`).
   */
  readonly baseTreeSha: string
  /**
   * Branch to advance (e.g. 'main').
   */
  readonly branch: string
  /**
   * Files to write in the commit.
   */
  readonly files: readonly CommitFile[]
  /**
   * Commit message.
   */
  readonly message: string
  /**
   * Parent commit SHA (usually `HEAD`).
   */
  readonly parentSha: string
  /**
   * Repo in "owner/name" form.
   */
  readonly repo: string
  /**
   * GitHub token. Falls back to env / git config via `getGitHubToken()`.
   */
  readonly token?: string | undefined
}

export function buildHeaders(token: string): Record<string, string> {
  return {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'x-github-api-version': '2022-11-28',
  }
}

/**
 * Create a signed commit on a branch via the GitHub git-objects API (blob ->
 * tree -> commit -> ref PATCH). Returns the new commit SHA. Commits created
 * through the API are web-flow-verified ("Verified") without a local signing
 * key — the only way CI can land signed commits on protected branches.
 *
 * @example
 *   ;```ts
 *   const sha = await createSignedCommit({
 *     repo: 'owner/repo',
 *     branch: 'main',
 *     parentSha: 'abc123',
 *     baseTreeSha: 'def456',
 *     message: 'chore: bump version to 1.2.0',
 *     files: [
 *       { path: 'package.json', content: '{"version":"1.2.0"}' },
 *       { path: 'CHANGELOG.md', content: '# Changelog\n' },
 *     ],
 *     token: process.env['GITHUB_TOKEN'],
 *   })
 *   ```
 *
 * @param options - Commit options including repo, branch, parent SHA, base tree
 *   SHA, files, message, and optional token/API URL override.
 *
 * @returns The new (verified) commit SHA.
 *
 * @throws {Error} When any GitHub git-objects API call fails.
 */
export async function createSignedCommit(
  options: CreateSignedCommitOptions,
): Promise<string> {
  const opts = { __proto__: null, ...options } as CreateSignedCommitOptions
  const token = opts.token ?? getGitHubToken() ?? ''
  const apiUrl = opts.apiUrl ?? GITHUB_API_BASE_URL
  const git = `${apiUrl}/repos/${opts.repo}/git`
  const headers = buildHeaders(token)

  // 1. One blob per file (base64 so binary-safe).
  const treeEntries: Array<{
    mode: string
    path: string
    sha: string
    type: string
  }> = []
  for (let i = 0, { length } = opts.files; i < length; i += 1) {
    const file = opts.files[i]!
    // oxlint-disable-next-line no-await-in-loop -- blobs must exist before the tree references them; file count is tiny (a bump touches 1-2 files).
    const blob = await post<{ sha: string }>(`${git}/blobs`, headers, {
      content: Buffer.from(file.content, 'utf8').toString('base64'),
      encoding: 'base64',
    })
    treeEntries.push({
      mode: '100644',
      path: file.path,
      sha: blob.sha,
      type: 'blob',
    })
  }

  // 2. Tree layered on the base tree.
  const newTree = await post<{ sha: string }>(`${git}/trees`, headers, {
    base_tree: opts.baseTreeSha,
    tree: treeEntries,
  })

  // 3. Commit (API-created => verified/signed).
  const commit = await post<{ sha: string }>(`${git}/commits`, headers, {
    message: opts.message,
    parents: [opts.parentSha],
    tree: newTree.sha,
  })

  // 4. Advance the branch ref.
  await patch(`${git}/refs/heads/${opts.branch}`, headers, {
    sha: commit.sha,
  })

  return commit.sha
}

export async function patch(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<void> {
  const response = await httpRequest(url, {
    body: JSONStringify(body),
    headers,
    method: 'PATCH',
    timeout: 30_000,
  })
  if (!response.ok) {
    throw new Error(
      `GitHub API PATCH ${url} failed — status ${response.status}: ${response.statusText}`,
    )
  }
}

export async function post<T>(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<T> {
  const response = await httpRequest(url, {
    body: JSONStringify(body),
    headers,
    method: 'POST',
    timeout: 30_000,
  })
  if (!response.ok) {
    throw new Error(
      `GitHub API POST ${url} failed — status ${response.status}: ${response.statusText}`,
    )
  }
  return response.json() as T
}
