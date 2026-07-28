/**
 * @file Split an array into fixed-size chunks. The last chunk holds the
 *   leftover when length is not evenly divisible.
 */

import { ErrorCtor } from '../primordials/error'

/**
 * Split an array into chunks of a specified size.
 *
 * Divides an array into smaller arrays of the specified chunk size. The last
 * chunk may contain fewer elements if the array length is not evenly divisible
 * by the chunk size.
 *
 * @example
 *   ;```ts
 *   // Split into pairs (default)
 *   arrayChunk([1, 2, 3, 4, 5])
 *   // Returns: [[1, 2], [3, 4], [5]]
 *
 *   // Split into groups of 3
 *   arrayChunk(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 3)
 *   // Returns: [['a', 'b', 'c'], ['d', 'e', 'f'], ['g']]
 *
 *   // Works with readonly arrays
 *   const readonlyArr = [1, 2, 3] as const
 *   arrayChunk(readonlyArr)
 *   // Returns: [[1, 2], [3]]
 *   ```
 *
 * @default 2
 *
 * @param arr - The array to split into chunks (can be readonly)
 * @param size - Size of each chunk. Must be greater than 0.
 *
 * @returns Array of chunks, where each chunk is an array of elements
 *
 * @throws {Error} If chunk size is less than or equal to 0
 */
export function arrayChunk<T>(
  arr: T[] | readonly T[],
  size?: number | undefined,
): T[][] {
  const chunkSize = size ?? 2
  if (chunkSize <= 0) {
    throw new ErrorCtor('Chunk size must be greater than 0')
  }
  const { length } = arr
  const chunks = []
  for (let i = 0; i < length; i += chunkSize) {
    chunks.push(arr.slice(i, i + chunkSize) as T[])
  }
  return chunks
}
