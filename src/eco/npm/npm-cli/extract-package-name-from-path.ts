/**
 * @file `extractPackageNameFromPath(pkgPath)` — given an npm v2/v3 lockfile
 *   entry key like `node_modules/a/node_modules/b`, returns the final package
 *   name (`b`), preserving scoped-package boundaries (`@scope/name` stays
 *   joined). Windows-generated lockfiles may use `\\` separators; the impl
 *   normalizes first so both forms are handled. Behavior matches socket-btm's
 *   smol-manifest internal `extractPackageNameFromPath`.
 */

import {
  StringPrototypeIndexOf,
  StringPrototypeLastIndexOf,
  StringPrototypeReplaceAll,
  StringPrototypeSlice,
  StringPrototypeSplit,
} from '../../../primordials/string'

const NODE_MODULES_PREFIX = 'node_modules/'

export function extractPackageNameFromPath(pkgPath: string): string {
  const normalized = StringPrototypeReplaceAll(pkgPath, '\\', '/')
  const lastNmIdx = StringPrototypeLastIndexOf(normalized, NODE_MODULES_PREFIX)
  if (lastNmIdx === -1) {
    return normalized
  }
  const withoutPrefix = StringPrototypeSlice(
    normalized,
    lastNmIdx + NODE_MODULES_PREFIX.length,
  )
  if (withoutPrefix[0] === '@') {
    const parts = StringPrototypeSplit(withoutPrefix, '/')
    if (parts.length < 2) {
      return withoutPrefix
    }
    return `${parts[0]}/${parts[1]}`
  }
  const firstSlash = StringPrototypeIndexOf(withoutPrefix, '/')
  if (firstSlash === -1) {
    return withoutPrefix
  }
  return StringPrototypeSlice(withoutPrefix, 0, firstSlash)
}
