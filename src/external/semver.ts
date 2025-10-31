/**
 * Lazy-loaded semver module.
 * Defers require() until first use to reduce startup time.
 * The 'semver' package is browser safe.
 */

let _semver: typeof import('semver') | undefined

/**
 * Get the semver module, loading it on first access.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getSemver() {
  if (_semver === undefined) {
    _semver = /*@__PURE__*/ require('./semver.js')
  }
  return _semver as typeof import('semver')
}

// Default export for convenience.
export default getSemver
