/**
 * Package metadata, defaults, extensions, and lifecycle scripts.
 */

import { getNpmLifecycleEvent as getNpmLifecycleEventEnv } from '#env/npm'
import { lifecycleScriptNames as lifecycleScriptNamesImport } from '../lifecycle-script-names'
import { packageDefaultNodeRange as packageDefaultNodeRangeImport } from '../package-default-node-range'
import { packageDefaultSocketCategories as packageDefaultSocketCategoriesImport } from '../package-default-socket-categories'
import { packageExtensions as packageExtensionsImport } from '../package-extensions'

import pacote from '../external/pacote'
import { normalizePath } from '../paths/normalize'

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

// Package default Node range.
/*@__NO_SIDE_EFFECTS__*/
export function getPackageDefaultNodeRange(): string | undefined {
  if (_packageDefaultNodeRange === undefined) {
    // packageDefaultNodeRange is imported at the top
    _packageDefaultNodeRange = packageDefaultNodeRangeImport
  }
  return _packageDefaultNodeRange
}

// Package default Socket categories.
/*@__NO_SIDE_EFFECTS__*/
export function getPackageDefaultSocketCategories() {
  if (_packageDefaultSocketCategories === undefined) {
    // packageDefaultSocketCategories is imported at the top
    _packageDefaultSocketCategories = packageDefaultSocketCategoriesImport
  }
  return _packageDefaultSocketCategories
}

// Package extensions.
/*@__NO_SIDE_EFFECTS__*/
export function getPackageExtensions(): Iterable<[string, unknown]> {
  if (_packageExtensions === undefined) {
    // packageExtensions is imported at the top
    _packageExtensions = Object.entries(packageExtensionsImport)
  }
  return _packageExtensions
}

// NPM lifecycle event.
/*@__NO_SIDE_EFFECTS__*/
export function getNpmLifecycleEvent(): string | undefined {
  return getNpmLifecycleEventEnv()
}

// Lifecycle script names.
/*@__NO_SIDE_EFFECTS__*/
export function getLifecycleScriptNames(): string[] {
  if (_lifecycleScriptNames === undefined) {
    // lifecycleScriptNames is imported at the top
    _lifecycleScriptNames = Array.from(lifecycleScriptNamesImport)
  }
  return _lifecycleScriptNames
}

// Packument cache.
/*@__NO_SIDE_EFFECTS__*/
export function getPackumentCache(): Map<string, unknown> {
  if (_packumentCache === undefined) {
    _packumentCache = new Map()
  }
  return _packumentCache
}

// Pacote cache path.
/*@__NO_SIDE_EFFECTS__*/
export function getPacoteCachePath(): string {
  if (_pacoteCachePath === undefined) {
    try {
      // module is imported at the top
      const proto = Reflect.getPrototypeOf(
        (pacote as { RegistryFetcher: { prototype: object } }).RegistryFetcher
          .prototype,
      ) as { constructor?: new (...args: unknown[]) => { cache: string } }
      const PacoteFetcherBase = proto?.constructor
      const cachePath = PacoteFetcherBase
        ? new PacoteFetcherBase(/*dummy package spec*/ 'x', {}).cache
        : ''
      _pacoteCachePath = normalizePath(cachePath)
    } catch {
      _pacoteCachePath = ''
    }
  }
  return _pacoteCachePath
}
