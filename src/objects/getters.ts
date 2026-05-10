/**
 * @fileoverview Lazy-getter primitives + `createConstantsObject`.
 *
 * `createConstantsObject` is the most-used factory in this module —
 * fleet repos use it to assemble frozen settings objects with a mix of
 * eager values, lazy-computed values, and internals reachable through
 * `kInternalsSymbol`. The `defineLazyGetter*` helpers underneath are
 * the building blocks; `createLazyGetter` is the memoizing primitive.
 *
 * Cycle: `defineLazyGetters` → `defineLazyGetter` → `defineGetter` +
 * `createLazyGetter`. All function-only references, no eager top-
 * level evaluation between siblings, so ESM tolerates.
 */

import { kInternalsSymbol, UNDEFINED_TOKEN } from '../constants/core'
import { SetCtor } from '../primordials/map-set'
import {
  ObjectDefineProperties,
  ObjectDefineProperty,
  ObjectFreeze,
  ObjectGetOwnPropertyDescriptors,
  ObjectHasOwn,
  ObjectSetPrototypeOf,
} from '../primordials/object'
import { ReflectOwnKeys } from '../primordials/reflect'

import {
  objectEntries,
  toSortedObject,
  toSortedObjectFromEntries,
} from './sort'

import type {
  ConstantsObjectOptions,
  GetterDefObj,
  LazyGetterRecord,
  LazyGetterStats,
} from './types'

/**
 * Create a frozen constants object with lazy getters and internal properties.
 *
 * This function creates an immutable object with:
 * - Regular properties from `props`
 * - Lazy getters that compute values on first access
 * - Internal properties accessible via `kInternalsSymbol`
 * - Mixin properties (lower priority, won't override existing)
 * - Alphabetically sorted keys for consistency
 *
 * The resulting object is deeply frozen and cannot be modified.
 *
 * @param props - Regular properties to include on the object
 * @param options_ - Configuration options
 * @returns A frozen object with all specified properties
 *
 * @example
 * ```ts
 * const config = createConstantsObject(
 *   { apiUrl: 'https://api.example.com' },
 *   {
 *     getters: { client: () => new APIClient() },
 *     internals: { version: '1.0.0' }
 *   }
 * )
 * console.log(config.apiUrl)                       // 'https://api.example.com'
 * console.log(config.client)                       // APIClient (lazy)
 * console.log(config[kInternalsSymbol].version)    // '1.0.0'
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function createConstantsObject(
  props: object,
  options_?: ConstantsObjectOptions | undefined,
): Readonly<object> {
  const options = { __proto__: null, ...options_ } as ConstantsObjectOptions
  const attributes = ObjectFreeze({
    __proto__: null,
    getters: options.getters
      ? ObjectFreeze(
          ObjectSetPrototypeOf(toSortedObject(options.getters), null),
        )
      : undefined,
    internals: options.internals
      ? ObjectFreeze(
          ObjectSetPrototypeOf(toSortedObject(options.internals), null),
        )
      : undefined,
    mixin: options.mixin
      ? ObjectFreeze(
          ObjectDefineProperties(
            { __proto__: null },
            ObjectGetOwnPropertyDescriptors(options.mixin),
          ),
        )
      : undefined,
    props: props
      ? ObjectFreeze(ObjectSetPrototypeOf(toSortedObject(props), null))
      : undefined,
  })
  const lazyGetterStats = ObjectFreeze({
    __proto__: null,
    initialized: new SetCtor<PropertyKey>(),
  })
  const object = defineLazyGetters(
    {
      __proto__: null,
      [kInternalsSymbol]: ObjectFreeze({
        __proto__: null,
        get attributes() {
          return attributes
        },
        get lazyGetterStats() {
          return lazyGetterStats
        },
        ...attributes.internals,
      }),
      kInternalsSymbol,
      ...attributes.props,
    },
    attributes.getters,
    lazyGetterStats,
  )
  if (attributes.mixin) {
    ObjectDefineProperties(
      object,
      toSortedObjectFromEntries(
        objectEntries(ObjectGetOwnPropertyDescriptors(attributes.mixin)).filter(
          p => !ObjectHasOwn(object, p[0]),
        ),
      ) as PropertyDescriptorMap,
    )
  }
  return ObjectFreeze(object)
}

/**
 * Create a lazy getter function that memoizes its result.
 *
 * The returned function will only call the getter once, caching the result
 * for subsequent calls. This is useful for expensive computations or
 * operations that should only happen when needed.
 *
 * @param name - The property key name for the getter (used for debugging and stats)
 * @param getter - Function that computes the value on first access
 * @param stats - Optional stats object to track initialization
 * @returns A memoized getter function
 *
 * @example
 * ```ts
 * const stats = { initialized: new Set() }
 * const getLargeData = createLazyGetter('data', () => expensive(), stats)
 * getLargeData() // Computes and caches
 * getLargeData() // Returns cached
 * stats.initialized.has('data') // true
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function createLazyGetter<T>(
  name: PropertyKey,
  getter: () => T,
  stats?: LazyGetterStats | undefined,
): () => T {
  let lazyValue: T | typeof UNDEFINED_TOKEN = UNDEFINED_TOKEN
  // Dynamically name the getter without using Object.defineProperty.
  const { [name]: lazyGetter } = {
    [name]() {
      if (lazyValue === UNDEFINED_TOKEN) {
        stats?.initialized?.add(name)
        lazyValue = getter()
      }
      return lazyValue as T
    },
  } as LazyGetterRecord<T>
  return lazyGetter as unknown as () => T
}

/**
 * Define a getter property on an object.
 *
 * The getter is non-enumerable and configurable, meaning it won't show up
 * in `for...in` loops or `Object.keys()`, but can be redefined later.
 *
 * @param object - The object to define the getter on
 * @param propKey - The property key for the getter
 * @param getter - Function that computes the property value
 * @returns The modified object (for chaining)
 *
 * @example
 * ```ts
 * const obj = {}
 * defineGetter(obj, 'timestamp', () => Date.now())
 * obj.timestamp  // Current timestamp (computed each access)
 * Object.keys(obj) // [] (non-enumerable)
 * ```
 */
export function defineGetter<T>(
  object: object,
  propKey: PropertyKey,
  getter: () => T,
): object {
  ObjectDefineProperty(object, propKey, {
    get: getter,
    enumerable: false,
    configurable: true,
  })
  return object
}

/**
 * Define a lazy getter property on an object.
 *
 * Unlike `defineGetter()`, this version memoizes the result so the getter
 * function is only called once. Subsequent accesses return the cached value.
 *
 * @param object - The object to define the lazy getter on
 * @param propKey - The property key for the lazy getter
 * @param getter - Function that computes the value on first access
 * @param stats - Optional stats object to track initialization
 * @returns The modified object (for chaining)
 */
export function defineLazyGetter<T>(
  object: object,
  propKey: PropertyKey,
  getter: () => T,
  stats?: LazyGetterStats | undefined,
): object {
  return defineGetter(object, propKey, createLazyGetter(propKey, getter, stats))
}

/**
 * Define multiple lazy getter properties on an object.
 *
 * Each getter in the provided object will be converted to a lazy getter
 * and attached to the target object. All getters share the same stats object
 * for tracking initialization.
 *
 * @param object - The object to define lazy getters on
 * @param getterDefObj - Object mapping property keys to getter functions
 * @param stats - Optional stats object to track initialization
 * @returns The modified object (for chaining)
 */
export function defineLazyGetters(
  object: object,
  getterDefObj: GetterDefObj | undefined,
  stats?: LazyGetterStats | undefined,
): object {
  if (getterDefObj !== null && typeof getterDefObj === 'object') {
    const keys = ReflectOwnKeys(getterDefObj)
    for (let i = 0, { length } = keys; i < length; i += 1) {
      const key = keys[i] as PropertyKey
      defineLazyGetter(object, key, getterDefObj[key] as () => unknown, stats)
    }
  }
  return object
}
