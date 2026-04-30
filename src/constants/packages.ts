/**
 * @fileoverview Package metadata, defaults, extensions, and lifecycle helpers.
 * Exposes lazily-memoized accessors for package defaults (Node range, Socket
 * categories), the pacote cache path, lifecycle script names, and known
 * package extensions used during manifest processing.
 */

import pacote from '../external/pacote'
import { packageExtensions as packageExtensionsImport } from '../package-extensions'
import { normalizePath } from '../paths/normalize'
import { lifecycleScriptNames as lifecycleScriptNamesImport } from './lifecycle-script-names'
import { packageDefaultNodeRange as packageDefaultNodeRangeImport } from './package-default-node-range'
import { packageDefaultSocketCategories as packageDefaultSocketCategoriesImport } from './package-default-socket-categories'

import { ArrayFrom, ObjectEntries, ReflectGetPrototypeOf } from '../primordials'

let _lifecycleScriptNames: string[]
let _packageDefaultNodeRange: string | undefined
let _packageDefaultSocketCategories: readonly string[]
let _packageExtensions: Iterable<[string, unknown]>
let _pacoteCachePath: string
let _packumentCache: Map<string, unknown>

// Package constants.
export const PACKAGE = 'package'
export const AT_LATEST = '@latest'
export const LATEST = 'latest'
export const PACKAGE_DEFAULT_VERSION = '1.0.0'

/**
 * Clear the packument cache. Useful for long-running processes that want to
 * force a re-fetch of registry metadata.
 */
export function clearPackumentCache(): void {
  if (_packumentCache !== undefined) {
    _packumentCache.clear()
  }
}

/*@__NO_SIDE_EFFECTS__*/
export function getLifecycleScriptNames(): string[] {
  if (_lifecycleScriptNames === undefined) {
    // lifecycleScriptNames is imported at the top
    _lifecycleScriptNames = ArrayFrom(lifecycleScriptNamesImport)
  }
  return _lifecycleScriptNames
}

/*@__NO_SIDE_EFFECTS__*/
export function getPackageDefaultNodeRange(): string | undefined {
  if (_packageDefaultNodeRange === undefined) {
    // packageDefaultNodeRange is imported at the top
    _packageDefaultNodeRange = packageDefaultNodeRangeImport
  }
  return _packageDefaultNodeRange
}

/*@__NO_SIDE_EFFECTS__*/
export function getPackageDefaultSocketCategories() {
  if (_packageDefaultSocketCategories === undefined) {
    // packageDefaultSocketCategories is imported at the top
    _packageDefaultSocketCategories = packageDefaultSocketCategoriesImport
  }
  return _packageDefaultSocketCategories
}

/*@__NO_SIDE_EFFECTS__*/
export function getPackageExtensions(): Iterable<[string, unknown]> {
  if (_packageExtensions === undefined) {
    // packageExtensions is imported at the top
    _packageExtensions = ObjectEntries(packageExtensionsImport)
  }
  return _packageExtensions
}

const PACKUMENT_CACHE_MAX = 500

class BoundedPackumentCache extends Map<string, unknown> {
  override set(key: string, value: unknown): this {
    if (this.has(key)) {
      this.delete(key)
    } else if (this.size >= PACKUMENT_CACHE_MAX) {
      const oldest = this.keys().next().value
      if (oldest !== undefined) {
        this.delete(oldest)
      }
    }
    return super.set(key, value)
  }
}

/*@__NO_SIDE_EFFECTS__*/
export function getPackumentCache(): Map<string, unknown> {
  if (_packumentCache === undefined) {
    _packumentCache = new BoundedPackumentCache()
  }
  return _packumentCache
}

/*@__NO_SIDE_EFFECTS__*/
export function getPacoteCachePath(): string {
  if (_pacoteCachePath === undefined) {
    try {
      // module is imported at the top
      const proto = ReflectGetPrototypeOf(
        (pacote as { RegistryFetcher: { prototype: object } }).RegistryFetcher
          .prototype,
      ) as { constructor?: new (...args: unknown[]) => { cache: string } }
      const PacoteFetcherBase = proto?.constructor
      const cachePath = PacoteFetcherBase
        ? new PacoteFetcherBase(/*dummy package spec*/ 'x', {}).cache
        : ''
      _pacoteCachePath = cachePath ? normalizePath(cachePath) : ''
    } catch {
      _pacoteCachePath = ''
    }
  }
  return _pacoteCachePath
}
