/**
 * @fileoverview `parseGitUrl(resolved)` — extracts `{ url, commit }`
 * from a `resolved` field on an npm lockfile entry when it points to
 * a git source (`git+…` or `git://…`).
 *
 * Returns `undefined` when the resolved string is not a git URL.
 * When the URL has no `#<commit>` suffix, `commit` is `undefined`.
 *
 * Shape matches socket-btm's smol-manifest internal `parseGitUrl` so
 * smol-vs-JS consumers see the same output.
 */

export interface GitUrlMatch {
  readonly url: string
  readonly commit: string | undefined
}

export function parseGitUrl(resolved: string): GitUrlMatch | undefined {
  if (resolved.indexOf('git+') !== 0 && resolved.indexOf('git://') !== 0) {
    return undefined
  }
  const hashIndex = resolved.indexOf('#')
  if (hashIndex === -1) {
    return { url: resolved, commit: undefined }
  }
  return {
    url: resolved.slice(0, hashIndex),
    commit: resolved.slice(hashIndex + 1),
  }
}
