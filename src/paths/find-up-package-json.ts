/**
 * @file Boundary-anchored `package.json` lookup. Replaces the brittle
 *   `path.join(__dirname, '..', '..'[, '..'])` pattern that breaks every
 *   time a script moves between directories. `findUpPackageJson(meta)`
 *   walks up from the calling script's URL to the nearest
 *   `package.json` and returns its absolute path. The ascent count is
 *   computed at runtime from the actual filesystem layout, not
 *   hard-coded into the source.
 *
 *   Naming: returns the package.json FILE path (matching the existing
 *   `findUpSync` family) — not the directory, not "the repo root".
 *   In a monorepo the package root and the repo root diverge; this
 *   helper finds the nearest enclosing **package**. Callers who want
 *   the directory do `path.dirname(found)`.
 *
 *   Use this instead of:
 *     const __dirname = path.dirname(fileURLToPath(import.meta.url))
 *     const rootPath = path.join(__dirname, '..', '..')
 *
 *   With:
 *     const rootPath = path.dirname(findUpPackageJson(import.meta))
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

export interface FindUpPackageJsonOptions {
  /**
   * Names to look for. Defaults to `['package.json']`. Pass alternate
   * markers for non-package roots (e.g. `['pnpm-workspace.yaml']` for
   * the workspace root in a pnpm monorepo).
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
 * Find the nearest `package.json` walking up from `import.meta`.
 * Returns the **absolute path to the file** (normalized to forward
 * slashes), matching the existing `findUpSync` family.
 *
 * @param meta - `import.meta` from the calling script.
 * @param options - Override the marker file name(s) or set a stopAt boundary.
 * @returns Absolute path to the marker file (e.g.
 *   `/abs/path/to/package.json`).
 * @throws If no marker file is found between the calling script and the
 *   filesystem root (or `stopAt`). This is a programming error — every
 *   script that uses this helper lives inside a package and should
 *   resolve.
 */
export function findUpPackageJson(
  meta: ImportMeta,
  options?: FindUpPackageJsonOptions | undefined,
): string {
  const { names = ['package.json'], stopAt } = {
    __proto__: null,
    ...options,
  } as FindUpPackageJsonOptions
  const scriptPath = fileURLToPath(meta.url)
  const path = getNodePath()
  const scriptDir = path.dirname(scriptPath)
  const found = findUpSync(names as string[], { cwd: scriptDir, stopAt })
  if (found === undefined) {
    throw new Error(
      `findUpPackageJson: no ${names.join(' / ')} found between ${scriptPath} and ${stopAt ?? 'filesystem root'}`,
    )
  }
  return normalizePath(found)
}
