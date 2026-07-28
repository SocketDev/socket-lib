/**
 * @file Find the nearest package.json (or other marker) walking up from an
 *   `import.meta` — the package-domain wrapper over the generic `findUpSync`
 *   lookup in `fs/find`. Lives here (not in `paths/`) because it touches the
 *   filesystem; `paths/packages.ts` stays pure path-string shaping.
 */

import { fileURLToPath } from 'node:url'

import { findUpSync } from '../fs/find'
import { getNodePath } from '../node/path'
import { normalizePath } from '../paths/normalize'

export interface FindUpPackageJsonOptions {
  /**
   * Names to look for. Defaults to `['package.json']`. Pass alternate markers
   * for non-package roots (e.g. `['pnpm-workspace.yaml']` for the workspace
   * root in a pnpm monorepo).
   */
  names?: readonly string[] | undefined
  /**
   * Optional ancestor boundary. Useful when a script is run from a deeply
   * nested fixture and you don't want to escape the test's tmpdir. Defaults to
   * the filesystem root.
   */
  stopAt?: string | undefined
}

/**
 * Find the nearest `package.json` walking up from `import.meta`. Returns the
 * absolute path to the file (normalized to forward slashes), matching the
 * `findUp` / `findUpSync` return shape. Throws when no marker is found — every
 * script using this helper lives inside a package and should resolve.
 *
 * Use this instead of `path.join(__dirname, '..', '..'[, '..'])`. The ascent
 * count is computed at runtime from the actual filesystem layout, not
 * hard-coded into the source, so the helper stays correct across refactors that
 * move scripts between directories.
 *
 * Pair with `readPackageJson` to find AND parse the nearest package.json:
 *
 * @example
 *   ;```ts
 *   const pkgJsonPath = findUpPackageJson(import.meta)
 *   // → '/abs/path/to/package.json'
 *   const pkg = await readPackageJson(pkgJsonPath)
 *   console.log(pkg?.name)
 *
 *   // Workspace root in a pnpm monorepo:
 *   const wsRoot = findUpPackageJson(import.meta, {
 *     names: ['pnpm-workspace.yaml'],
 *   })
 *   ```
 *
 * @param meta - `import.meta` from the calling script.
 * @param options - Override marker name(s) or set a stopAt boundary.
 *
 * @returns Absolute, normalized path to the marker file.
 *
 * @throws When no marker is found between the script and the filesystem root
 *   (or `stopAt`).
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
