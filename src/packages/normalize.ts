/**
 * @fileoverview Package.json normalization utilities.
 */

import {
  REGISTRY_SCOPE_DELIMITER,
  SOCKET_REGISTRY_SCOPE,
} from '../constants/socket'
import { escapeRegExp } from '../regexps'
import normalizePackageData from '../external/normalize-package-data'
import { merge } from '../objects'

import type { NormalizeOptions, PackageJson } from '../packages'

const ArrayIsArray = Array.isArray
const ObjectHasOwn = Object.hasOwn

function getEscapedScopeRegExp(): RegExp {
  const firstChar = REGISTRY_SCOPE_DELIMITER[0] as string
  return new RegExp(
    `^[^${escapeRegExp(firstChar)}]+${escapeRegExp(REGISTRY_SCOPE_DELIMITER)}(?!${escapeRegExp(firstChar)})`,
  )
}

let _findPackageExtensions:
  | ((name: string, version: string) => unknown)
  | undefined
/**
 * Get the findPackageExtensions function from operations module.
 * Lazy loaded to avoid circular dependency.
 */
function _getFindPackageExtensions() {
  if (_findPackageExtensions === undefined) {
    // Dynamically import to avoid circular dependency.
    // Use path alias for reliable resolution in both test and production environments.
    const operations: {
      findPackageExtensions: (name: string, version: string) => unknown
    } = require('#packages/operations')
    _findPackageExtensions = operations.findPackageExtensions
  }
  return _findPackageExtensions as (name: string, version: string) => unknown
}

/**
 * Normalize a package.json object with standard npm package normalization.
 */
/*@__NO_SIDE_EFFECTS__*/
export function normalizePackageJson(
  pkgJson: PackageJson,
  options?: NormalizeOptions,
): PackageJson {
  const { preserve } = { __proto__: null, ...options } as NormalizeOptions
  // Add default version if not present.
  if (!ObjectHasOwn(pkgJson, 'version')) {
    pkgJson.version = '0.0.0'
  }
  const preserved = [
    ['_id', undefined],
    ['readme', undefined],
    ...(ObjectHasOwn(pkgJson, 'bugs') ? [] : [['bugs', undefined]]),
    ...(ObjectHasOwn(pkgJson, 'homepage') ? [] : [['homepage', undefined]]),
    ...(ObjectHasOwn(pkgJson, 'name') ? [] : [['name', undefined]]),
    ...(ArrayIsArray(preserve)
      ? preserve.map(k => [
          k,
          ObjectHasOwn(pkgJson, k) ? pkgJson[k] : undefined,
        ])
      : []),
  ]
  normalizePackageData(pkgJson)
  // Apply package extensions if name and version are present.
  if (pkgJson.name && pkgJson.version) {
    const findPackageExtensions = _getFindPackageExtensions()
    const extensions = findPackageExtensions(pkgJson.name, pkgJson.version)
    if (extensions && typeof extensions === 'object') {
      merge(pkgJson, extensions)
    }
  }
  // Revert/remove properties we don't care to have normalized.
  // Properties with undefined values are omitted when saved as JSON.
  for (const { 0: key, 1: value } of preserved) {
    pkgJson[key as keyof typeof pkgJson] = value
  }
  return pkgJson
}

/**
 * Extract escaped scope from a Socket registry package name.
 */
/*@__NO_SIDE_EFFECTS__*/
export function resolveEscapedScope(
  sockRegPkgName: string,
): string | undefined {
  const escapedScopeRegExp = getEscapedScopeRegExp()
  const match = escapedScopeRegExp.exec(sockRegPkgName)?.[0]
  return match || undefined
}

/**
 * Resolve original package name from Socket registry package name.
 */
/*@__NO_SIDE_EFFECTS__*/
export function resolveOriginalPackageName(sockRegPkgName: string): string {
  const name = sockRegPkgName.startsWith(`${SOCKET_REGISTRY_SCOPE}/`)
    ? sockRegPkgName.slice(SOCKET_REGISTRY_SCOPE.length + 1)
    : sockRegPkgName
  const escapedScope = resolveEscapedScope(name)
  return escapedScope
    ? `${unescapeScope(escapedScope)}/${name.slice(escapedScope.length)}`
    : name
}

/**
 * Convert escaped scope to standard npm scope format.
 */
/*@__NO_SIDE_EFFECTS__*/
export function unescapeScope(escapedScope: string): string {
  return `@${escapedScope.slice(0, -REGISTRY_SCOPE_DELIMITER.length)}`
}
