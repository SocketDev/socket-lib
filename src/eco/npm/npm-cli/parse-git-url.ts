/**
 * @file `parseGitUrl(resolved)` — extracts `{ url, commit }` from a `resolved`
 *   field on an npm lockfile entry when it points to a git source (`git+…` or
 *   `git://…`). Returns `undefined` when the resolved string is not a git URL.
 *   When the URL has no `#<commit>` suffix, `commit` is `undefined`. Shape
 *   matches socket-btm's smol-manifest internal `parseGitUrl` so smol-vs-JS
 *   consumers see the same output.
 */

import {
  StringPrototypeIndexOf,
  StringPrototypeSlice,
} from '../../../primordials/string'

export interface GitUrlMatch {
  readonly url: string
  readonly commit: string | undefined
}

export function parseGitUrl(resolved: string): GitUrlMatch | undefined {
  if (
    StringPrototypeIndexOf(resolved, 'git+') !== 0 &&
    StringPrototypeIndexOf(resolved, 'git://') !== 0
  ) {
    return undefined
  }
  const hashIndex = StringPrototypeIndexOf(resolved, '#')
  if (hashIndex === -1) {
    return { url: resolved, commit: undefined }
  }
  return {
    url: StringPrototypeSlice(resolved, 0, hashIndex),
    commit: StringPrototypeSlice(resolved, hashIndex + 1),
  }
}
