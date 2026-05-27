/**
 * @file Walk parent directories. `walkUp` is the lazy ancestor generator that
 *   `fs/find-up` and package-root lookups build on: given a starting path it
 *   yields that path, then each parent, up to and INCLUDING the filesystem root
 *   (or a caller-supplied `stopAt` boundary). Lazy so a caller can stop early
 *   without computing the whole chain.
 */

import process from 'node:process'

import { getNodePath } from '../node/path'

import { normalizePath } from './normalize'

export interface WalkUpOptions {
  /**
   * Starting directory. Relative `from` values are resolved against this.
   * Defaults to `process.cwd()`.
   */
  cwd?: string | undefined
  /**
   * Last directory to yield (INCLUSIVE). Traversal stops after this path is
   * emitted. Defaults to the filesystem root.
   */
  stopAt?: string | undefined
}

/**
 * Lazily yield `from` and each of its ancestor directories, up to and including
 * the filesystem root (or `stopAt`). Each yielded path is normalized to forward
 * slashes.
 *
 * @example
 *   ;```ts
 *   for (const dir of walkUp('/a/b/c')) {
 *     // '/a/b/c', '/a/b', '/a', '/'
 *   }
 *
 *   // Stop at a boundary (inclusive):
 *   [...walkUp('/a/b/c', { stopAt: '/a' })] // ['/a/b/c', '/a/b', '/a']
 *   ```
 *
 * @param from - Path to start from. Relative values resolve against `cwd`.
 * @param options - `cwd` and `stopAt` boundary.
 *
 * @returns Generator of normalized absolute directory paths.
 */
export function* walkUp(
  from: string,
  options?: WalkUpOptions | undefined,
): Generator<string> {
  const { cwd = process.cwd(), stopAt } = {
    __proto__: null,
    ...options,
  } as WalkUpOptions
  const path = getNodePath()
  let dir = path.resolve(cwd, from)
  const stopDir = stopAt ? path.resolve(cwd, stopAt) : undefined
  let prev: string | undefined
  while (dir !== prev) {
    yield normalizePath(dir)
    if (stopDir !== undefined && dir === stopDir) {
      return
    }
    prev = dir
    dir = path.dirname(dir)
  }
}
