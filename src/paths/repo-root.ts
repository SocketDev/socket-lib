/**
 * @file Boundary-anchored repo-root resolution. Replaces the brittle
 *   `path.join(__dirname, '..', '..'[, '..'])` pattern that breaks every
 *   time a script moves between directories. `findRepoRoot(meta)` walks
 *   up from the calling script's URL to the nearest `package.json` and
 *   returns its directory. The ascent count is computed at runtime from
 *   the actual filesystem layout, not hard-coded into the source.
 *
 *   Use this instead of:
 *     const __dirname = path.dirname(fileURLToPath(import.meta.url))
 *     const rootPath = path.join(__dirname, '..', '..')
 *
 *   With:
 *     const rootPath = findRepoRoot(import.meta)
 *
 *   The bug class this exists to prevent — scripts-into-subdir refactors
 *   that leave hard-coded ascent counts stale — bit 12 files across two
 *   wheelhouse refactors (73c691d9, 86c2e575) before this helper landed.
 *   See commit ce4a693b for the full inventory.
 */

import { fileURLToPath } from 'node:url'

import { findUpSync } from '../fs/find-up'
import { getNodePath } from '../node/path'

import { normalizePath } from './normalize'

export interface FindRepoRootOptions {
  /**
   * Names to look for. Defaults to `['package.json']`. Pass `['.git']`
   * to anchor on a git checkout root instead (useful for monorepo
   * roots that aren't themselves npm packages).
   */
  names?: readonly string[] | undefined
  /**
   * Optional ancestor boundary. Useful when a script is run from a
   * deeply nested fixture and you don't want to escape the test's
   * tmpdir. Defaults to the filesystem root.
   */
  stopAt?: string | undefined
}

/**
 * Find the repo root containing `import.meta` by walking up to the
 * nearest `package.json`. Returns the **directory** path (normalized to
 * forward slashes), not the package.json path itself.
 *
 * @param meta - `import.meta` from the calling script.
 * @param options - Override the marker file name(s) or set a stopAt boundary.
 * @returns Absolute path to the directory containing the marker.
 * @throws If no marker file is found between the calling script and the
 *   filesystem root (or `stopAt`). This is a programming error — every
 *   script that uses this helper lives inside a package and should
 *   resolve.
 */
export function findRepoRoot(
  meta: ImportMeta,
  options?: FindRepoRootOptions | undefined,
): string {
  const { names = ['package.json'], stopAt } = {
    __proto__: null,
    ...options,
  } as FindRepoRootOptions
  const scriptPath = fileURLToPath(meta.url)
  const path = getNodePath()
  const scriptDir = path.dirname(scriptPath)
  const marker = findUpSync(names as string[], { cwd: scriptDir, stopAt })
  if (marker === undefined) {
    throw new Error(
      `findRepoRoot: no ${names.join(' / ')} found between ${scriptPath} and ${stopAt ?? 'filesystem root'}`,
    )
  }
  return normalizePath(path.dirname(marker))
}
