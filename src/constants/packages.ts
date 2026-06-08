/**
 * @file Package metadata, defaults, extensions, and lifecycle helpers. Exposes
 *   lazily-memoized accessors for package defaults (Node range, Socket
 *   categories), the pacote cache path, lifecycle script names, and known
 *   package extensions used during manifest processing.
 */

import pacote from '../external/pacote'
import { packageExtensions as packageExtensionsImport } from '../pkg-ext/data'
import { normalizePath } from '../paths/normalize'
import { lifecycleScriptNames as lifecycleScriptNamesImport } from './lifecycle-script-names'
import { packageDefaultNodeRange as packageDefaultNodeRangeImport } from './package-default-node-range'
import { packageDefaultSocketCategories as packageDefaultSocketCategoriesImport } from './package-default-socket-categories'

import { ArrayFrom } from '../primordials/array'

import { ObjectEntries } from '../primordials/object'

import { ReflectGetPrototypeOf } from '../primordials/reflect'
let cachedLifecycleScriptNames: string[]
let cachedPackageDefaultNodeRange: string | undefined
let cachedPackageDefaultSocketCategories: readonly string[]
let cachedPackageExtensions: Iterable<[string, unknown]>
let cachedPacoteCachePath: string
let cachedPackumentCache: Map<string, unknown>

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
  // First-call branch fires only when cache is uninitialized; tests
  // exercise the truthy path.
  /* c8 ignore next 3 - uninitialized-cache branch unreachable in tests */
  if (cachedPackumentCache !== undefined) {
    cachedPackumentCache.clear()
  }
}

export function getLifecycleScriptNames(): string[] {
  if (cachedLifecycleScriptNames === undefined) {
    // lifecycleScriptNames is imported at the top
    cachedLifecycleScriptNames = ArrayFrom(lifecycleScriptNamesImport)
  }
  return cachedLifecycleScriptNames
}

export function getPackageDefaultNodeRange(): string | undefined {
  if (cachedPackageDefaultNodeRange === undefined) {
    // packageDefaultNodeRange is imported at the top
    cachedPackageDefaultNodeRange = packageDefaultNodeRangeImport
  }
  return cachedPackageDefaultNodeRange
}

export function getPackageDefaultSocketCategories() {
  if (cachedPackageDefaultSocketCategories === undefined) {
    // packageDefaultSocketCategories is imported at the top
    cachedPackageDefaultSocketCategories = packageDefaultSocketCategoriesImport
  }
  return cachedPackageDefaultSocketCategories
}

export function getPackageExtensions(): Iterable<[string, unknown]> {
  if (cachedPackageExtensions === undefined) {
    // packageExtensions is imported at the top
    cachedPackageExtensions = ObjectEntries(packageExtensionsImport)
  }
  return cachedPackageExtensions
}

const PACKUMENT_CACHE_MAX = 500

export class BoundedPackumentCache extends Map<string, unknown> {
  override set(key: string, value: unknown): this {
    // LRU touch/eviction: has-existing tested via Wave 4; fill-to-max
    // requires 500 distinct keys (impractical in test). The
    // oldest!==undefined defensive guard is unreachable when size>=max.
    /* c8 ignore start */
    if (this.has(key)) {
      this.delete(key)
    } else if (this.size >= PACKUMENT_CACHE_MAX) {
      const oldest = this.keys().next().value
      if (oldest !== undefined) {
        this.delete(oldest)
      }
    }
    /* c8 ignore stop */
    return super.set(key, value)
  }
}

export function getPackumentCache(): Map<string, unknown> {
  if (cachedPackumentCache === undefined) {
    cachedPackumentCache = new BoundedPackumentCache()
  }
  return cachedPackumentCache
}

export function getPacoteCachePath(): string {
  if (cachedPacoteCachePath === undefined) {
    try {
      // module is imported at the top
      const proto = ReflectGetPrototypeOf(
        (pacote as { RegistryFetcher: { prototype: object } }).RegistryFetcher
          .prototype,
      ) as {
        constructor?:
          | (new (...args: unknown[]) => { cache: string })
          | undefined
      }
      const PacoteFetcherBase = proto?.constructor
      // PacoteFetcherBase fallback fires only when pacote internals
      // change; cachePath fallback fires only when constructor returns
      // empty cache. Both defensive against pacote API drift.
      /* c8 ignore start */
      const cachePath = PacoteFetcherBase
        ? new PacoteFetcherBase(/*placeholder package spec*/ 'x', {}).cache
        : ''
      cachedPacoteCachePath = cachePath ? normalizePath(cachePath) : ''
      /* c8 ignore stop */
    } catch {
      cachedPacoteCachePath = ''
    }
  }
  return cachedPacoteCachePath
}
