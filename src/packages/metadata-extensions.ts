/**
 * @file Package-extension lookup: match a package name + version against the
 *   `packageExtensions` overrides table (the same data pnpm/yarn use to patch
 *   missing dependency metadata) and merge the matching entries.
 */

import { getPackageExtensions } from '../constants/packages'
import { merge } from '../objects/mutate'
import { getSemver } from '../versions/_internal'

const packageExtensions = getPackageExtensions()

/**
 * Find package extensions for a given package.
 *
 * @example
 *   ;```typescript
 *   const extensions = findPackageExtensions('my-pkg', '1.0.0')
 *   ```
 */
export function findPackageExtensions(
  pkgName: string,
  pkgVer: string,
): unknown {
  let result: unknown
  for (const entry of packageExtensions) {
    const selector = String(entry[0])
    const ext = entry[1]
    const lastAtSignIndex = selector.lastIndexOf('@')
    const name = selector.slice(0, lastAtSignIndex)
    if (pkgName === name) {
      // semver is imported at the top
      const range = selector.slice(lastAtSignIndex + 1)
      const semver = getSemver()
      if (semver.satisfies(pkgVer, range)) {
        if (result === undefined) {
          result = {}
        }
        if (typeof ext === 'object' && ext !== null) {
          merge(result as object, ext)
        }
      }
    }
  }
  return result
}
