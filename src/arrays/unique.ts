/**
 * @file Deduplicate an array via `Set`. Preserves
 * first-occurrence order.
 */

import { SetCtor } from '../primordials/map-set'

/**
 * Get unique values from an array.
 *
 * Returns a new array containing only the unique values from the input array.
 * Uses `Set` internally for efficient deduplication. Order of first occurrence
 * is preserved.
 *
 * @example
 *   ;```ts
 *   // Remove duplicate numbers
 *   arrayUnique([1, 2, 2, 3, 1, 4])
 *   // Returns: [1, 2, 3, 4]
 *
 *   // Remove duplicate strings
 *   arrayUnique(['apple', 'banana', 'apple', 'cherry'])
 *   // Returns: ['apple', 'banana', 'cherry']
 *
 *   // Works with readonly arrays
 *   const readonlyArr = [1, 1, 2] as const
 *   arrayUnique(readonlyArr)
 *   // Returns: [1, 2]
 *
 *   // Empty arrays return empty
 *   arrayUnique([])
 *   // Returns: []
 *   ```
 *
 * @param arr - The array to deduplicate (can be readonly)
 *
 * @returns New array with duplicate values removed
 */
export function arrayUnique<T>(arr: T[] | readonly T[]): T[] {
  return [...new SetCtor(arr)]
}
