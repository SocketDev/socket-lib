/**
 * @file `getTrackedIgnoredFiles` — the paths git TRACKS that the repo's own
 *   `.gitignore` also IGNORES. `git ls-files -ci --exclude-standard` is the
 *   authoritative detector: it already honors negations, so every path it
 *   returns is net-ignored yet tracked — a bug (state a fresh clone re-ignores:
 *   build output, a vendored tree, a stray submodule gitlink). Resolve each by
 *   untracking the junk (`git update-index --force-remove`) or re-including a
 *   hand-authored file with a `!` negation so git no longer ignores it.
 */

import { normalizePath } from '../paths/normalize'
import { ArrayPrototypeSort } from '../primordials/array'
import { StringPrototypeSplit } from '../primordials/string'
import { spawn } from '../process/spawn/child'
import { getCwd } from './repo'
import type { GitPathOptions } from './tracked'

/**
 * The tracked-yet-ignored paths in `cwd`'s repo, normalized + sorted. Empty
 * when the tree is clean, or when git is unavailable (the caller decides
 * whether a missing git binary is fatal — this probe stays vacuous).
 *
 * @example
 *   ;```typescript
 *   await getTrackedIgnoredFiles()
 *   // => ['dist/index.js', 'packages/core/upstream/opentui']
 *   ```
 */
export async function getTrackedIgnoredFiles(
  options?: GitPathOptions | undefined,
): Promise<string[]> {
  const { cwd = getCwd() } = { __proto__: null, ...options } as GitPathOptions
  const stdout = await spawn('git', ['ls-files', '-ci', '--exclude-standard'], {
    cwd,
    stdioString: true,
  }).then(
    result => String((result as { stdout?: string | undefined })?.stdout ?? ''),
    () => '',
  )
  const out: string[] = []
  const lines = StringPrototypeSplit(stdout, '\n')
  for (let i = 0, { length } = lines; i < length; i += 1) {
    const line = lines[i]!
    if (line === '') {
      continue
    }
    out[out.length] = normalizePath(line)
  }
  return ArrayPrototypeSort(out)
}
