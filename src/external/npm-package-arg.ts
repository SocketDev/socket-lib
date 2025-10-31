/**
 * Lazy-loaded npm-package-arg module.
 * Defers require() until first use to reduce startup time.
 */

let _npmPackageArg: typeof import('npm-package-arg') | undefined

/**
 * Get the npm-package-arg module, loading it on first access.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getNpmPackageArg() {
  if (_npmPackageArg === undefined) {
    _npmPackageArg = /*@__PURE__*/ require('./npm-package-arg.js')
  }
  return _npmPackageArg as typeof import('npm-package-arg')
}

// Default export for convenience.
export default getNpmPackageArg
