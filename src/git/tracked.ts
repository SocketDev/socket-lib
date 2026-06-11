/**
 * @file Tracked-status + submodule-membership probes for a working-tree path.
 *   `isTracked` answers "does git track this exact path?"; `getSubmodulePaths`
 *   lists the repo's submodule mount points; `isInSubmodule` answers "does this
 *   path live inside one?". Built for cleanup tooling that must never delete a
 *   tracked file or reach into a submodule's own tree (which would dirty it) —
 *   compose them in `fs/safe`'s `isPathSafeToDelete`.
 */

import { normalizePath } from '../paths/normalize'
import { ArrayPrototypeSome } from '../primordials/array'
import {
  StringPrototypeEndsWith,
  StringPrototypeSplit,
  StringPrototypeStartsWith,
  StringPrototypeTrim,
} from '../primordials/string'
import { spawn } from '../process/spawn/child'
import { getCwd } from './repo'

/**
 * The repo's submodule mount points as normalized, repo-root-relative paths
 * (e.g. `vendor/acorn`). Reads `git config` on `.gitmodules`, so it lists
 * declared submodules whether or not they are initialized — the case a
 * stderr-message check on `git ls-files` misses.
 *
 * @example
 *   ;```typescript
 *   await getSubmodulePaths()
 *   // => ['packages/acorn/upstream/acorn', 'vendor/mbedtls']
 *   ```
 */
export async function getSubmodulePaths(
  options?: GitPathOptions | undefined,
): Promise<string[]> {
  const { cwd = getCwd() } = { __proto__: null, ...options } as GitPathOptions
  const stdout = await spawn(
    'git',
    ['config', '--file', '.gitmodules', '--get-regexp', 'path'],
    { cwd, stdioString: true },
  ).then(
    /* c8 ignore next - stdioString:true always yields a string stdout; the
       ?? '' is a defensive fallback that never fires on real spawn output. */
    result => String((result as { stdout?: string | undefined })?.stdout ?? ''),
    () => '',
  )
  const lines = StringPrototypeSplit(stdout, '\n')
  const paths: string[] = []
  for (let i = 0, { length } = lines; i < length; i += 1) {
    const line = StringPrototypeTrim(lines[i]!)
    /* c8 ignore start - defensive parse guards: `git config --get-regexp`
       always emits a `key value` line, so the blank-line and no-space skips
       and the empty-value branch never fire on real git output. */
    if (!line) {
      continue
    }
    // Each line is `submodule.<name>.path <relative-path>`.
    const spaceIdx = line.indexOf(' ')
    if (spaceIdx === -1) {
      continue
    }
    const rel = StringPrototypeTrim(line.slice(spaceIdx + 1))
    if (!rel) {
      continue
    }
    /* c8 ignore stop */
    paths.push(normalizePath(rel))
  }
  return paths
}

/**
 * Whether `targetPath` lives inside one of the repo's submodules. Resolves the
 * submodule list itself; for a batch sweep prefer `getSubmodulePaths` once plus
 * `pathIsUnderSubmodule` per path.
 *
 * @example
 *   ;```typescript
 *   await isInSubmodule('vendor/mbedtls/x.py')  // => true
 *   await isInSubmodule('src/index.ts')         // => false
 *   ```
 */
export async function isInSubmodule(
  targetPath: string,
  options?: GitPathOptions | undefined,
): Promise<boolean> {
  const submodulePaths = await getSubmodulePaths(options)
  if (!submodulePaths.length) {
    return false
  }
  return pathIsUnderSubmodule(targetPath, submodulePaths)
}

export interface GitPathOptions {
  /**
   * The git working-tree directory the path is resolved against.
   *
   * @default process.cwd()
   */
  cwd?: string | undefined
}

/**
 * Whether git tracks `targetPath` exactly. Uses `git ls-files --error-unmatch`,
 * which exits non-zero for an untracked path. A path inside a submodule, or one
 * git does not know, returns `false`.
 *
 * @example
 *   ;```typescript
 *   await isTracked('src/index.ts')        // => true
 *   await isTracked('.DS_Store')           // => false
 *   ```
 */
export async function isTracked(
  targetPath: string,
  options?: GitPathOptions | undefined,
): Promise<boolean> {
  const { cwd = getCwd() } = { __proto__: null, ...options } as GitPathOptions
  return await spawn('git', ['ls-files', '--error-unmatch', targetPath], {
    cwd,
    stdioString: true,
  }).then(
    () => true,
    () => false,
  )
}

/**
 * Whether `relativePath` (repo-root-relative) lies at or under any of
 * `submodulePaths`. Pure — pass the result of `getSubmodulePaths` so the git
 * read happens once for a whole sweep.
 *
 * @example
 *   ;```typescript
 *   pathIsUnderSubmodule('vendor/mbedtls/scripts/__pycache__', ['vendor/mbedtls'])
 *   // => true
 *   ```
 */
export function pathIsUnderSubmodule(
  relativePath: string,
  submodulePaths: string[],
): boolean {
  const normalized = normalizePath(relativePath)
  return ArrayPrototypeSome(submodulePaths, sub => {
    return (
      normalized === sub ||
      StringPrototypeStartsWith(normalized, `${sub}/`) ||
      StringPrototypeEndsWith(sub, normalized)
    )
  })
}
