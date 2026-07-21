/**
 * @file `getTreeManifest` — the `git ls-tree -r <ref>` manifest of a commit.
 *   Every line is `<mode> <type> <blob-sha>\t<path>`; the blob SHAs are git's
 *   immutable content addresses and `ls-tree` output is git-version-stable, so
 *   a hash of this manifest is an UNMOVABLE content fingerprint tied to the
 *   commit — a reproducible content pin for a source whose host serves no
 *   stable archive (a gitiles `+archive` .tar.gz is gzip-timestamped and
 *   regenerated per fetch, i.e. movable under your feet). Requires the ref be
 *   present in `cwd`'s repo (a materialized submodule worktree, say).
 */

import { StringPrototypeTrim } from '../primordials/string'
import { spawn } from '../process/spawn/child'
import { getCwd } from './repo'
import type { GitPathOptions } from './tracked'

/**
 * The raw `git ls-tree -r <ref>` manifest for `ref` in `cwd`'s repo. Rejects
 * when the ref is absent (unmaterialized submodule / unknown commit) — the
 * caller distinguishes "cannot pin" from "empty tree" — and throws on a present
 * ref that yields no output. Hash the returned string (e.g. SHA-256) to get the
 * unmovable content pin.
 *
 * @example
 *   ;```typescript
 *   const manifest = await getTreeManifest('HEAD', { cwd: worktree })
 *   const pin = createHash('sha256').update(manifest).digest('hex')
 *   ```
 */
export async function getTreeManifest(
  ref: string,
  options?: GitPathOptions | undefined,
): Promise<string> {
  const { cwd = getCwd() } = { __proto__: null, ...options } as GitPathOptions
  const result = (await spawn('git', ['ls-tree', '-r', ref], {
    cwd,
    stdioString: true,
  })) as { stdout?: string | undefined }
  const manifest = String(result?.stdout ?? '')
  if (StringPrototypeTrim(manifest) === '') {
    throw new Error(
      `git ls-tree produced no output for ${ref} in ${cwd} — the ref is not present (unmaterialized submodule or unknown commit)`,
    )
  }
  return manifest
}
