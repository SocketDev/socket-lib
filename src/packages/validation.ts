/**
 * @fileoverview Package name validation utilities.
 */

import validateNpmPackageName from '../external/validate-npm-package-name'

import { StringPrototypeStartsWith } from '../primordials'

/**
 * Check if package name is a blessed Socket.dev package.
 *
 * @example
 * ```typescript
 * isBlessedPackageName('@socketregistry/is-number') // true
 * isBlessedPackageName('lodash')                    // false
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function isBlessedPackageName(name: unknown): boolean {
  return (
    typeof name === 'string' &&
    (name === 'sfw' ||
      name === 'socket' ||
      StringPrototypeStartsWith(name, '@socketoverride/') ||
      StringPrototypeStartsWith(name, '@socketregistry/') ||
      StringPrototypeStartsWith(name, '@socketsecurity/'))
  )
}

/**
 * Check if a type string represents a registry fetcher type.
 *
 * @example
 * ```typescript
 * isRegistryFetcherType('range')   // true
 * isRegistryFetcherType('git')     // false
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function isRegistryFetcherType(type: string): boolean {
  // RegistryFetcher spec.type check based on:
  // https://github.com/npm/pacote/blob/v19.0.0/lib/fetcher.js#L467-L488
  return (
    type === 'alias' || type === 'range' || type === 'tag' || type === 'version'
  )
}

/**
 * Check if a package name is valid according to npm naming rules.
 *
 * @example
 * ```typescript
 * isValidPackageName('my-package')   // true
 * isValidPackageName('.invalid')     // false
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function isValidPackageName(name: string): boolean {
  // validateNpmPackageName is imported at the top
  return validateNpmPackageName(name).validForOldPackages
}
