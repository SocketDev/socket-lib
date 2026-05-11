/**
 * @fileoverview Array type-guard predicates. Currently just a
 * re-export of native `Array.isArray` for consistency with the rest
 * of the arrays surface — kept in its own leaf because it's
 * runtime-trivial but conceptually a different concern from
 * `chunk` / `unique` / `join`.
 */

// IMPORTANT: Do not use destructuring here - use direct assignment instead.
// tsgo has a bug that incorrectly transpiles destructured exports, resulting in
// `exports.SomeName = void 0;` which causes runtime errors.
// See: https://github.com/SocketDev/socket-packageurl-js/issues/3

/**
 * Alias for native Array.isArray.
 * Determines whether the passed value is an array.
 *
 * This is a direct reference to the native `Array.isArray` method,
 * providing a type guard that narrows the type to an array type.
 * Exported for consistency with other array utilities in this module.
 *
 * @param value - The value to check
 * @returns `true` if the value is an array, `false` otherwise
 *
 * @example
 * ```ts
 * // Check if value is an array
 * isArray([1, 2, 3])
 * // Returns: true
 *
 * isArray('not an array')
 * // Returns: false
 *
 * isArray(null)
 * // Returns: false
 *
 * // Type guard usage
 * function processValue(value: unknown) {
 *   if (isArray(value)) {
 *     // TypeScript knows value is an array here
 *     console.log(value.length)
 *   }
 * }
 * ```
 */
export const isArray = Array.isArray
