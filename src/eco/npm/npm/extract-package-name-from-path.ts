/**
 * @fileoverview `extractPackageNameFromPath(pkgPath)` — given an npm
 * v2/v3 lockfile entry key like `node_modules/a/node_modules/b`,
 * returns the final package name (`b`), preserving scoped-package
 * boundaries (`@scope/name` stays joined).
 *
 * Windows-generated lockfiles may use `\\` separators; the impl
 * normalizes first so both forms are handled. Behavior matches
 * socket-btm's smol-manifest internal `extractPackageNameFromPath`.
 */

const NODE_MODULES_PREFIX = 'node_modules/'

export function extractPackageNameFromPath(pkgPath: string): string {
  const normalized = pkgPath.replaceAll('\\', '/')
  const lastNmIdx = normalized.lastIndexOf(NODE_MODULES_PREFIX)
  if (lastNmIdx === -1) {
    return normalized
  }
  const withoutPrefix = normalized.slice(lastNmIdx + NODE_MODULES_PREFIX.length)
  if (withoutPrefix[0] === '@') {
    const parts = withoutPrefix.split('/')
    if (parts.length < 2) {
      return withoutPrefix
    }
    return `${parts[0]}/${parts[1]}`
  }
  const firstSlash = withoutPrefix.indexOf('/')
  if (firstSlash === -1) {
    return withoutPrefix
  }
  return withoutPrefix.slice(0, firstSlash)
}
