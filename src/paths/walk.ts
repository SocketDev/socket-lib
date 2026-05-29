/**
 * @file Walk parent directories. `walkUp` is the lazy ancestor generator that
 *   `fs/find-up` and package-root lookups build on: given a starting path it
 *   yields that path, then each parent, up to and INCLUDING the filesystem root
 *   (or a caller-supplied `stopAt` boundary). Lazy so a caller can stop early
 *   without computing the whole chain.
 */

import process from 'node:process'

import { getNodePath } from '../node/path'
import { getSmolPath } from '../smol/path'

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

// A bare Windows drive letter with no trailing slash.
const BARE_DRIVE_RE = /^[A-Za-z]:$/

/**
 * Normalize a directory for `walkUp` output. Like `normalizePath`, but keeps
 * the root slash on a bare Windows drive letter: `normalizePath('D:\\')`
 * collapses the trailing separator to `'D:'` (correct for general paths, where
 * `'D:'` means "current directory on D:"), yet the filesystem root `walkUp`
 * must emit is `'D:/'` — matching `path.parse(dir).root`. Without the slash the
 * final ancestor would differ from the actual root on Windows.
 *
 * @param dir - An absolute directory path.
 *
 * @returns The forward-slash-normalized path, with the drive root preserved.
 */
export function normalizeWalkDir(dir: string): string {
  const normalized = normalizePath(dir)
  return BARE_DRIVE_RE.test(normalized) ? `${normalized}/` : normalized
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
  // Native `dirname` via node:smol-path (one-byte Fast API) when available —
  // this is the hot inner-loop call for findUp / findPackageJson. Falls back
  // to node:path on stock Node. `getSmolPath()` is undefined on stock Node,
  // so `dirname` is `path.dirname` in every non-smol environment (incl.
  // tests); the native binding is exercised by socket-btm's own tests.
  /* c8 ignore next 2 - native binding only on socket-btm smol binaries. */
  const smol = getSmolPath()
  const dirname = smol?.dirname ?? path.dirname
  let dir = path.resolve(cwd, from)
  const stopDir = stopAt ? path.resolve(cwd, stopAt) : undefined
  let prev: string | undefined
  while (dir !== prev) {
    yield normalizeWalkDir(dir)
    if (stopDir !== undefined && dir === stopDir) {
      return
    }
    prev = dir
    dir = dirname(dir)
  }
}
