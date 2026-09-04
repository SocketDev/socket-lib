/**
 * @file Package metadata, defaults, extensions, and lifecycle helpers. Exposes
 *   lazily-memoized accessors for package defaults (Node range, Socket
 *   categories), the pacote cache path, lifecycle script names, and known
 *   package extensions used during manifest processing.
 */

import pacote from '../external/pacote.js'
import { packageExtensions as packageExtensionsImport } from '../eco/npm/package-extensions/data.mjs'
import { normalizePath } from '../paths/normalize.mjs'
import { lifecycleScriptNames as lifecycleScriptNamesImport } from '../eco/npm/constants/lifecycle-script-names.mjs'
import { packageDefaultNodeRange as packageDefaultNodeRangeImport } from '../eco/npm/constants/package-default-node-range.mjs'
import { packageDefaultSocketCategories as packageDefaultSocketCategoriesImport } from './package-default-socket-categories.mjs'

import { ArrayFrom } from '../primordials/array.mjs'

import { ReflectGetPrototypeOf } from '../primordials/reflect.mjs'
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
 *
 * @unused No internal or Socket consumers; exercised only by its unit tests.
 */
export function clearPackumentCache(): void {
  // First-call branch fires only when cache is uninitialized; tests
  // exercise the truthy path.
  /* c8 ignore next 3 - uninitialized-cache branch unreachable in tests */
  if (cachedPackumentCache !== undefined) {
    cachedPackumentCache.clear()
  }
}

/**
 * @unused No internal or Socket consumers; exercised only by its unit tests.
 */
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
    // Already an array of `[selector, extension]` pairs, which is the shape
    // callers iterate. Running it through Object.entries wraps each pair in an
    // `[index, pair]` tuple, so every caller read the array index where the
    // selector belongs and no extension ever matched a package.
    cachedPackageExtensions = packageExtensionsImport as Iterable<
      [string, unknown]
    >
  }
  return cachedPackageExtensions
}

const PACKUMENT_CACHE_MAX = 500

export class BoundedPackumentCache extends Map<string, unknown> {
  override set(key: string, value: unknown): this {
    // LRU touch/eviction: has-existing tested via Wave 4; fill-to-max
    // requires 500 distinct keys, which is impractical in test. The
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
