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
import { findPackageExtensions } from './operations'

import type { NormalizeOptions, PackageJson } from '../packages'

import { RegExpCtor, StringPrototypeStartsWith } from '../primordials'

const ArrayIsArray = Array.isArray
const ObjectHasOwn = Object.hasOwn

function getEscapedScopeRegExp(): RegExp {
  const firstChar = REGISTRY_SCOPE_DELIMITER[0] as string
  return new RegExpCtor(
    `^[^${escapeRegExp(firstChar)}]+${escapeRegExp(REGISTRY_SCOPE_DELIMITER)}(?!${escapeRegExp(firstChar)})`,
  )
}

/**
 * Normalize a package.json object with standard npm package normalization.
 *
 * @example
 * ```typescript
 * const pkgJson = { name: 'my-pkg', version: '1.0.0' }
 * const normalized = normalizePackageJson(pkgJson)
 * ```
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
 *
 * @example
 * ```typescript
 * resolveEscapedScope('babel__core') // 'babel__'
 * resolveEscapedScope('lodash')      // undefined
 * ```
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
 *
 * @example
 * ```typescript
 * resolveOriginalPackageName('@socketregistry/is-number') // 'is-number'
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function resolveOriginalPackageName(sockRegPkgName: string): string {
  const name = StringPrototypeStartsWith(
    sockRegPkgName,
    `${SOCKET_REGISTRY_SCOPE}/`,
  )
    ? sockRegPkgName.slice(SOCKET_REGISTRY_SCOPE.length + 1)
    : sockRegPkgName
  const escapedScope = resolveEscapedScope(name)
  return escapedScope
    ? `${unescapeScope(escapedScope)}/${name.slice(escapedScope.length)}`
    : name
}

/**
 * Convert escaped scope to standard npm scope format.
 *
 * @example
 * ```typescript
 * unescapeScope('babel__') // '@babel'
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function unescapeScope(escapedScope: string): string {
  if (escapedScope.length < REGISTRY_SCOPE_DELIMITER.length) {
    return `@${escapedScope}`
  }
  return `@${escapedScope.slice(0, -REGISTRY_SCOPE_DELIMITER.length)}`
}
