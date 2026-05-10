/**
 * @fileoverview Walk parent directories to locate a file or directory
 * by name. The traversal includes the filesystem root (or the
 * caller-supplied `stopAt` boundary) — historically the loop exited at
 * `dir === root` *before* visiting root itself, so a match at e.g.
 * `/.foo` was never found. The current shape visits root, then breaks.
 */

/* oxlint-disable socket/prefer-exists-sync -- needs stat to discriminate file vs directory matches via isFile()/isDirectory(). */

import process from 'node:process'

import { isArray } from '../arrays'
import { getAbortSignal } from '../constants/process'
import { getNodeFs } from '../node/fs'
import { getNodePath } from '../node/path'
import { normalizePath } from '../paths/normalize'

import type { FindUpOptions, FindUpSyncOptions } from './types'

const abortSignal = getAbortSignal()

/**
 * Find a file or directory by traversing up parent directories.
 * Searches from the starting directory upward to the filesystem root.
 * Useful for finding configuration files or project roots.
 *
 * @param name - Filename(s) to search for
 * @param options - Search options including cwd and type filters
 * @returns Normalized absolute path if found, undefined otherwise
 *
 * @example
 * ```ts
 * // Find package.json starting from current directory
 * const pkgPath = await findUp('package.json')
 *
 * // Find any of multiple config files
 * const configPath = await findUp(['.config.js', '.config.json'])
 *
 * // Find a directory instead of file
 * const nodeModules = await findUp('node_modules', { onlyDirectories: true })
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export async function findUp(
  name: string | string[] | readonly string[],
  options?: FindUpOptions | undefined,
): Promise<string | undefined> {
  const { cwd = process.cwd(), signal = abortSignal } = {
    __proto__: null,
    ...options,
  } as FindUpOptions
  let { onlyDirectories = false, onlyFiles = true } = {
    __proto__: null,
    ...options,
  } as FindUpOptions
  if (onlyDirectories) {
    onlyFiles = false
  }
  if (onlyFiles) {
    onlyDirectories = false
  }
  const fs = getNodeFs()
  const path = getNodePath()
  let dir = path.resolve(cwd)
  const { root } = path.parse(dir)
  const names = isArray(name) ? name : [name as string]
  // Traverse up to and INCLUDING the filesystem root. Previously the
  // loop exited when `dir === root`, so a match at e.g. `/.foo` was
  // never visited.
  while (dir) {
    for (const n of names) {
      if (signal?.aborted) {
        return undefined
      }
      const thePath = path.join(dir, n)
      try {
        // eslint-disable-next-line no-await-in-loop
        const stats = await fs.promises.stat(thePath)
        if (!onlyDirectories && stats.isFile()) {
          return normalizePath(thePath)
        }
        if (!onlyFiles && stats.isDirectory()) {
          return normalizePath(thePath)
        }
      } catch {}
    }
    if (dir === root) {
      break
    }
    dir = path.dirname(dir)
  }
  return undefined
}

/**
 * Synchronously find a file or directory by traversing up parent directories.
 * Searches from the starting directory upward to the filesystem root or `stopAt` directory.
 * Useful for finding configuration files or project roots in synchronous contexts.
 *
 * @param name - Filename(s) to search for
 * @param options - Search options including cwd, stopAt, and type filters
 * @returns Normalized absolute path if found, undefined otherwise
 *
 * @example
 * ```ts
 * // Find package.json starting from current directory
 * const pkgPath = findUpSync('package.json')
 *
 * // Find .git directory but stop at home directory
 * const gitPath = findUpSync('.git', {
 *   onlyDirectories: true,
 *   stopAt: process.env.HOME
 * })
 *
 * // Find any of multiple config files
 * const configPath = findUpSync(['.eslintrc.js', '.eslintrc.json'])
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function findUpSync(
  name: string | string[] | readonly string[],
  options?: FindUpSyncOptions | undefined,
) {
  const { cwd = process.cwd(), stopAt } = {
    __proto__: null,
    ...options,
  } as FindUpSyncOptions
  let { onlyDirectories = false, onlyFiles = true } = {
    __proto__: null,
    ...options,
  } as FindUpSyncOptions
  if (onlyDirectories) {
    onlyFiles = false
  }
  if (onlyFiles) {
    onlyDirectories = false
  }
  const fs = getNodeFs()
  const path = getNodePath()
  let dir = path.resolve(cwd)
  const { root } = path.parse(dir)
  const stopDir = stopAt ? path.resolve(stopAt) : undefined
  const names = isArray(name) ? name : [name as string]
  // Traverse up to and INCLUDING the filesystem root (or stopAt). The
  // old `while (dir && dir !== root)` exited before visiting `root`
  // itself, so a match at `/.foo` was never found.
  while (dir) {
    // stopDir-equality block fires only when caller passes stopAt;
    // tests rarely exercise this code path.
    /* c8 ignore start */
    if (stopDir && dir === stopDir) {
      for (const n of names) {
        const thePath = path.join(dir, n)
        try {
          const stats = fs.statSync(thePath)
          if (!onlyDirectories && stats.isFile()) {
            return normalizePath(thePath)
          }
          if (!onlyFiles && stats.isDirectory()) {
            return normalizePath(thePath)
          }
        } catch {}
      }
      return undefined
    }
    /* c8 ignore stop */
    for (const n of names) {
      const thePath = path.join(dir, n)
      try {
        const stats = fs.statSync(thePath)
        if (!onlyDirectories && stats.isFile()) {
          return normalizePath(thePath)
        }
        if (!onlyFiles && stats.isDirectory()) {
          return normalizePath(thePath)
        }
      } catch {}
    }
    if (dir === root) {
      break
    }
    dir = path.dirname(dir)
  }
  return undefined
}
