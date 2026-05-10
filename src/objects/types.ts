/**
 * @fileoverview Public type surface for `objects/*` modules — getter
 * definition shapes and the `Remap` type helper. Pure types, no
 * runtime side effects.
 */

/**
 * Record of property keys mapped to getter functions.
 * Used for defining lazy getters on objects.
 */
export type GetterDefObj = { [key: PropertyKey]: () => unknown }

/**
 * Statistics tracking for lazy getter initialization.
 * Keeps track of which lazy getters have been accessed and initialized.
 */
export type LazyGetterStats = { initialized?: Set<PropertyKey> | undefined }

/**
 * Configuration options for creating constants objects.
 */
export type ConstantsObjectOptions = {
  /**
   * Lazy getter definitions to attach to the object.
   * @default undefined
   */
  getters?: GetterDefObj | undefined
  /**
   * Internal properties to store under `kInternalsSymbol`.
   * @default undefined
   */
  internals?: object | undefined
  /**
   * Properties to mix into the object (lower priority than `props`).
   * @default undefined
   */
  mixin?: object | undefined
}

/**
 * Type helper that creates a remapped type with fresh property mapping.
 * Useful for flattening intersection types into a single object type.
 */
export type Remap<T> = { [K in keyof T]: T[K] } extends infer O
  ? { [K in keyof O]: O[K] }
  : never

/**
 * Type for dynamic lazy getter record.
 */
export type LazyGetterRecord<T> = {
  [key: PropertyKey]: () => T
}

/**
 * Type for generic property bag.
 */
export type PropertyBag = {
  [key: PropertyKey]: unknown
}

/**
 * Type for generic sorted object entries.
 */
export type SortedObject<T> = {
  [key: PropertyKey]: T
}
