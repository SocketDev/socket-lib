/**
 * @file Package.json path resolution utilities.
 */

import { normalizePath } from './normalize'

import { StringPrototypeEndsWith } from '../primordials/string'

import { getNodePath } from '../node/path'

/**
 * Whether `filepath`'s final segment is exactly `package.json`. Accepts both
 * POSIX and Windows-style separators so paths captured on either platform
 * classify the same regardless of the host we're running on.
 */
export function isPackageJsonFile(filepath: string): boolean {
  return (
    filepath === 'package.json' ||
    StringPrototypeEndsWith(filepath, '/package.json') ||
    StringPrototypeEndsWith(filepath, '\\package.json')
  )
}

/**
 * Resolve directory path from a package.json file path.
 */
export function resolvePackageJsonDirname(filepath: string): string {
  if (isPackageJsonFile(filepath)) {
    const path = getNodePath()
    return normalizePath(path.dirname(filepath))
  }
  return normalizePath(filepath)
}

/**
 * Resolve full path to package.json from a directory or file path.
 */
export function resolvePackageJsonPath(filepath: string): string {
  if (isPackageJsonFile(filepath)) {
    return normalizePath(filepath)
  }
  const path = getNodePath()
  return normalizePath(path.join(filepath, 'package.json'))
}

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
 * Find the nearest `package.json` walking up from `import.meta`. Returns the
 * absolute path to the file (normalized to forward slashes), matching the
 * existing `findUpSync` family. Callers who want the directory do
 * `path.dirname(found)`, or pass the result through `resolvePackageJsonDirname`.
 *
 * Use this to replace the fragile `path.join(__dirname, '..', '..'[, '..'])`
 * pattern that breaks every time a script moves between directories. The
 * ascent count is computed at runtime from the actual filesystem layout,
 * not hard-coded into the source.
 *
 * @example
 *   ;```ts
 *   const pkgJson = findUpPackageJson(import.meta)
 *   // → '/abs/path/to/package.json'
 *   const pkgRoot = resolvePackageJsonDirname(pkgJson)
 *   // → '/abs/path/to'
 *   ```
 *
 * @param meta - `import.meta` from the calling script.
 * @param options - Override the marker file name(s) or set a stopAt boundary.
 * @returns Absolute path to the marker file.
 * @throws If no marker is found between the calling script and the filesystem
 *   root (or `stopAt`). This is a programming error — every script that uses
 *   this helper lives inside a package and should resolve.
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
