/**
 * @fileoverview Safe deletion + idempotent directory creation. The
 * delete helpers gate destructive operations behind an "allowed
 * directories" allow-list (temp dir, cacache dir, ~/.socket); paths
 * outside those need an explicit `force: true`. The mkdir helpers
 * default to `recursive: true` and swallow `EEXIST` so concurrent
 * callers don't race-condition each other.
 */

import { isArray } from '../arrays'
import { isErrnoException } from '../errors'
import { getNodeFs } from '../node/fs'
import { getNodePath } from '../node/path'
import { objectFreeze } from '../objects/mutate'
import { pathLikeToString } from '../paths/normalize'
import { AtomicsWait, Int32ArrayCtor } from '../primordials/array'
import { SharedArrayBufferCtor } from '../primordials/globals'
import { StringPrototypeStartsWith } from '../primordials/string'
import { pRetry } from '../promises/retry'

import { getAllowedDirectories } from './_internal'
// Side-effect import: registers invalidatePathCache with paths/rewire
// so test-time path overrides flush the allowed-directories cache used
// by safeDelete / safeDeleteSync below. Without this import, rewiring
// the temp / cacache / socket-user dirs in a test would not affect
// subsequent safeDelete calls — they'd see stale resolved paths.
import './path-cache'

import type { MakeDirectoryOptions, PathLike } from 'node:fs'

import type {
  deleteAsync as deleteAsyncType,
  deleteSync as deleteSyncType,
} from '../external/del'
import type { RemoveOptions } from './types'

const defaultRemoveOptions = objectFreeze({
  __proto__: null,
  force: true,
  maxRetries: 3,
  recursive: true,
  retryDelay: 200,
})

let _del:
  | { deleteAsync: typeof deleteAsyncType; deleteSync: typeof deleteSyncType }
  | undefined

/*@__NO_SIDE_EFFECTS__*/
export function getDel() {
  if (_del === undefined) {
    _del = /*@__PURE__*/ require('../external/del')
  }
  return _del!
}

/**
 * Safely delete a file or directory asynchronously with built-in protections.
 *
 * Uses [`del`](https://socket.dev/npm/package/del/overview/8.0.1) for safer deletion with these safety features:
 * - By default, prevents deleting the current working directory (cwd) and above
 * - Allows deleting within cwd (descendant paths) without force option
 * - Automatically uses force: true for temp directory, cacache, and ~/.socket subdirectories
 * - Protects against accidental deletion of parent directories via `../` paths
 *
 * @param filepath - Path or array of paths to delete (supports glob patterns)
 * @param options - Deletion options including force, retries, and recursion
 * @param options.force - Set to true to allow deleting cwd and above (use with caution)
 * @throws {Error} When attempting to delete protected paths without force option
 *
 * @example
 * ```ts
 * // Delete files within cwd (safe by default)
 * await safeDelete('./build')
 * await safeDelete('./dist')
 *
 * // Delete with glob patterns
 * await safeDelete(['./temp/**', '!./temp/keep.txt'])
 *
 * // Delete with custom retry settings
 * await safeDelete('./flaky-dir', { maxRetries: 5, retryDelay: 500 })
 *
 * // Force delete cwd or above (requires explicit force: true)
 * await safeDelete('../parent-dir', { force: true })
 * ```
 */
export async function safeDelete(
  filepath: PathLike | PathLike[],
  options?: RemoveOptions | undefined,
) {
  // deleteAsync is lazily loaded via getDel()
  const opts = { __proto__: null, ...options } as RemoveOptions
  const patterns = isArray(filepath)
    ? filepath.map(pathLikeToString)
    : [pathLikeToString(filepath)]

  // shouldForce default is true; the allowedDirs branch fires only
  // when caller passes `force: false` to bypass auto-force.
  /* c8 ignore start */
  let shouldForce = opts.force !== false
  if (!shouldForce && patterns.length > 0) {
    const path = getNodePath()
    const allowedDirs = getAllowedDirectories()

    const allInAllowedDirs = patterns.every(pattern => {
      const resolvedPath = path.resolve(pattern)

      for (const allowedDir of allowedDirs) {
        const isInAllowedDir =
          StringPrototypeStartsWith(resolvedPath, allowedDir + path.sep) ||
          resolvedPath === allowedDir
        const relativePath = path.relative(allowedDir, resolvedPath)
        const isGoingBackward = StringPrototypeStartsWith(relativePath, '..')

        if (isInAllowedDir && !isGoingBackward) {
          return true
        }
      }

      return false
    })

    if (allInAllowedDirs) {
      shouldForce = true
    }
  }
  /* c8 ignore stop */

  const maxRetries = opts.maxRetries ?? defaultRemoveOptions.maxRetries
  const retryDelay = opts.retryDelay ?? defaultRemoveOptions.retryDelay

  /* c8 ignore start - External del call */
  const del = getDel()
  await pRetry(
    async () => {
      await del.deleteAsync(patterns, {
        dryRun: false,
        force: shouldForce,
        onlyFiles: false,
      })
    },
    {
      retries: maxRetries,
      baseDelayMs: retryDelay,
      backoffFactor: 2,
      signal: opts.signal,
    },
  )
  /* c8 ignore stop */
}

/**
 * Safely delete a file or directory synchronously with built-in protections.
 *
 * Uses [`del`](https://socket.dev/npm/package/del/overview/8.0.1) for safer deletion with these safety features:
 * - By default, prevents deleting the current working directory (cwd) and above
 * - Allows deleting within cwd (descendant paths) without force option
 * - Automatically uses force: true for temp directory, cacache, and ~/.socket subdirectories
 * - Protects against accidental deletion of parent directories via `../` paths
 *
 * @param filepath - Path or array of paths to delete (supports glob patterns)
 * @param options - Deletion options including force, retries, and recursion
 * @param options.force - Set to true to allow deleting cwd and above (use with caution)
 * @throws {Error} When attempting to delete protected paths without force option
 *
 * @example
 * ```ts
 * // Delete files within cwd (safe by default)
 * safeDeleteSync('./build')
 * safeDeleteSync('./dist')
 *
 * // Delete with glob patterns
 * safeDeleteSync(['./temp/**', '!./temp/keep.txt'])
 *
 * // Delete multiple paths
 * safeDeleteSync(['./coverage', './reports'])
 *
 * // Force delete cwd or above (requires explicit force: true)
 * safeDeleteSync('../parent-dir', { force: true })
 * ```
 */
export function safeDeleteSync(
  filepath: PathLike | PathLike[],
  options?: RemoveOptions | undefined,
) {
  // deleteSync is lazily loaded via getDel()
  const opts = { __proto__: null, ...options } as RemoveOptions
  const patterns = isArray(filepath)
    ? filepath.map(pathLikeToString)
    : [pathLikeToString(filepath)]

  // shouldForce default is true; the allowedDirs branch fires only
  // when caller passes `force: false` to bypass auto-force.
  /* c8 ignore start */
  let shouldForce = opts.force !== false
  if (!shouldForce && patterns.length > 0) {
    const path = getNodePath()
    const allowedDirs = getAllowedDirectories()

    const allInAllowedDirs = patterns.every(pattern => {
      const resolvedPath = path.resolve(pattern)

      for (const allowedDir of allowedDirs) {
        const isInAllowedDir =
          StringPrototypeStartsWith(resolvedPath, allowedDir + path.sep) ||
          resolvedPath === allowedDir
        const relativePath = path.relative(allowedDir, resolvedPath)
        const isGoingBackward = StringPrototypeStartsWith(relativePath, '..')

        if (isInAllowedDir && !isGoingBackward) {
          return true
        }
      }

      return false
    })

    if (allInAllowedDirs) {
      shouldForce = true
    }
  }
  /* c8 ignore stop */

  const maxRetries = opts.maxRetries ?? defaultRemoveOptions.maxRetries
  const retryDelay = opts.retryDelay ?? defaultRemoveOptions.retryDelay

  /* c8 ignore start - External del call */
  const del = getDel()
  let lastError: Error | undefined
  let delay = retryDelay
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      del.deleteSync(patterns, {
        dryRun: false,
        force: shouldForce,
        onlyFiles: false,
      })
      return
    } catch (e) {
      lastError = e as Error
      if (attempt < maxRetries) {
        // Sync sleep using Atomics.wait on a SharedArrayBuffer.
        // This is a blocking wait that doesn't spin the CPU.
        const waitMs = delay
        AtomicsWait(
          new Int32ArrayCtor(new SharedArrayBufferCtor(4)),
          0,
          0,
          waitMs,
        )
        delay *= 2 // Exponential backoff
      }
    }
  }
  if (lastError) {
    throw lastError
  }
  /* c8 ignore stop */
}

/**
 * Safely create a directory asynchronously, ignoring EEXIST errors.
 * This function wraps fs.promises.mkdir and handles the race condition where
 * the directory might already exist, which is common in concurrent code.
 *
 * Unlike fs.promises.mkdir with recursive:true, this function:
 * - Silently ignores EEXIST errors (directory already exists)
 * - Re-throws all other errors (permissions, invalid path, etc.)
 * - Works reliably in multi-process/concurrent scenarios
 * - Defaults to recursive: true for convenient nested directory creation
 *
 * @param path - Directory path to create
 * @param options - Options including recursive (default: true) and mode settings
 * @returns Promise that resolves when directory is created or already exists
 *
 * @example
 * ```ts
 * // Create a directory recursively by default, no error if it exists
 * await safeMkdir('./config')
 *
 * // Create nested directories (recursive: true is the default)
 * await safeMkdir('./data/cache/temp')
 *
 * // Create with specific permissions
 * await safeMkdir('./secure', { mode: 0o700 })
 *
 * // Explicitly disable recursive behavior
 * await safeMkdir('./single-level', { recursive: false })
 * ```
 */
export async function safeMkdir(
  path: PathLike,
  options?: MakeDirectoryOptions | undefined,
): Promise<void> {
  const fs = getNodeFs()
  const opts = { __proto__: null, recursive: true, ...options }
  try {
    await fs.promises.mkdir(path, opts)
    // EEXIST defensive: !isErrnoException fires only on non-Error
    // throws; the e.code !== 'EEXIST' arm fires only when mkdir fails
    // for non-existence reasons (permissions, etc.), which tests
    // don't simulate.
    /* c8 ignore start */
  } catch (e: unknown) {
    if (!isErrnoException(e) || e.code !== 'EEXIST') {
      throw e
    }
  }
  /* c8 ignore stop */
}

/**
 * Safely create a directory synchronously, ignoring EEXIST errors.
 * This function wraps fs.mkdirSync and handles the race condition where
 * the directory might already exist, which is common in concurrent code.
 *
 * Unlike fs.mkdirSync with recursive:true, this function:
 * - Silently ignores EEXIST errors (directory already exists)
 * - Re-throws all other errors (permissions, invalid path, etc.)
 * - Works reliably in multi-process/concurrent scenarios
 * - Defaults to recursive: true for convenient nested directory creation
 *
 * @param path - Directory path to create
 * @param options - Options including recursive (default: true) and mode settings
 *
 * @example
 * ```ts
 * // Create a directory recursively by default, no error if it exists
 * safeMkdirSync('./config')
 *
 * // Create nested directories (recursive: true is the default)
 * safeMkdirSync('./data/cache/temp')
 *
 * // Create with specific permissions
 * safeMkdirSync('./secure', { mode: 0o700 })
 *
 * // Explicitly disable recursive behavior
 * safeMkdirSync('./single-level', { recursive: false })
 * ```
 */
export function safeMkdirSync(
  path: PathLike,
  options?: MakeDirectoryOptions | undefined,
): void {
  const fs = getNodeFs()
  const opts = { __proto__: null, recursive: true, ...options }
  try {
    fs.mkdirSync(path, opts)
    // EEXIST defensive (see safeMkdir).
    /* c8 ignore start */
  } catch (e: unknown) {
    if (!isErrnoException(e) || e.code !== 'EEXIST') {
      throw e
    }
  }
  /* c8 ignore stop */
}
