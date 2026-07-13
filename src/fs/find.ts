/**
 * @file Walk parent directories to locate a file or directory by name. The
 *   traversal includes the filesystem root (or the caller-supplied `stopAt`
 *   boundary) — historically the loop exited at `dir === root` _before_
 *   visiting root itself, so a match at e.g. `/.foo` was never found. The
 *   current shape visits root, then breaks.
 */

import process from 'node:process'

import { isArray } from '../arrays/predicates'
import { getAbortSignal } from '../process/abort'
import { getNodeFs } from '../node/fs'
import { getNodePath } from '../node/path'
import { normalizePath } from '../paths/normalize'
import { walkUp } from '../paths/walk'
import { getSmolPath } from '../smol/path'

import type { FindUpOptions, FindUpSyncOptions } from './types'

/**
 * Find a file or directory by traversing up parent directories. Searches from
 * the starting directory upward to the filesystem root. Useful for finding
 * configuration files or project roots.
 *
 * @example
 *   ;```ts
 *   // Find package.json starting from current directory
 *   const pkgPath = await findUp('package.json')
 *
 *   // Find any of multiple config files
 *   const configPath = await findUp(['.config.js', '.config.json'])
 *
 *   // Find a directory instead of file
 *   const nodeModules = await findUp('node_modules', { onlyDirectories: true })
 *   ```
 *
 * @param name - Filename(s) to search for.
 * @param options - Search options including cwd and type filters.
 *
 * @returns Normalized absolute path if found, undefined otherwise
 */
export async function findUp(
  name: string | string[] | readonly string[],
  options?: FindUpOptions | undefined,
): Promise<string | undefined> {
  const { cwd = process.cwd(), signal = getAbortSignal() } = {
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
  const names = isArray(name) ? name : [name as string]
  // walkUp computes the ancestor chain synchronously (pure dirname
  // math); we await the stat inside. The async findUp has no stopAt
  // option in its type, so the walk runs to the filesystem root.
  for (const dir of walkUp(cwd)) {
    for (const n of names) {
      if (signal?.aborted) {
        return undefined
      }
      const thePath = path.join(dir, n)
      try {
        // oxlint-disable-next-line socket/prefer-exists-sync -- needs stat to discriminate file vs directory matches via isFile()/isDirectory().
        const stats = await fs.promises.stat(thePath)
        if (!onlyDirectories && stats.isFile()) {
          return normalizePath(thePath)
        }
        if (!onlyFiles && stats.isDirectory()) {
          return normalizePath(thePath)
        }
      } catch {}
    }
  }
  return undefined
}

/**
 * Synchronously find a file or directory by traversing up parent directories.
 * Searches from the starting directory upward to the filesystem root or
 * `stopAt` directory. Useful for finding configuration files or project roots
 * in synchronous contexts.
 *
 * @example
 *   ;```ts
 *   // Find package.json starting from current directory
 *   const pkgPath = findUpSync('package.json')
 *
 *   // Find .git directory but stop at home directory
 *   const gitPath = findUpSync('.git', {
 *     onlyDirectories: true,
 *     stopAt: process.env.HOME,
 *   })
 *
 *   // Find any of multiple config files
 *   const configPath = findUpSync(['.eslintrc.js', '.eslintrc.json'])
 *   ```
 *
 * @param name - Filename(s) to search for.
 * @param options - Search options including cwd, stopAt, and type filters.
 *
 * @returns Normalized absolute path if found, undefined otherwise
 */
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
  const names = isArray(name) ? name : [name as string]
  // Native in-C++ find-up when available — one binding call instead of N
  // JS↔native crossings (a dirname-loop + a stat per candidate). Only the
  // no-`stopAt` case maps to the binding's signature; bounded walks keep the
  // JS path. Native may be partial (onlyFiles only), so we only delegate when
  // the requested shape is expressible.
  /* c8 ignore start - native findUp arm only on socket-btm smol binaries; getSmolPath() is undefined on stock Node. */
  const smolFindUp = getSmolPath()?.findUp
  if (smolFindUp && stopAt === undefined) {
    const found = smolFindUp(path.resolve(cwd), names, { onlyDirectories })
    return found === undefined ? undefined : normalizePath(found)
  }
  /* c8 ignore stop */
  // walkUp yields each ancestor (incl. root / stopAt) lazily; the
  // stopAt boundary that used to need a duplicated tail block is now
  // just the generator's `stopAt` option.
  for (const dir of walkUp(cwd, { stopAt })) {
    for (const n of names) {
      const thePath = path.join(dir, n)
      try {
        // oxlint-disable-next-line socket/prefer-exists-sync -- needs stat to discriminate file vs directory matches via isFile()/isDirectory().
        const stats = fs.statSync(thePath)
        if (!onlyDirectories && stats.isFile()) {
          return normalizePath(thePath)
        }
        if (!onlyFiles && stats.isDirectory()) {
          return normalizePath(thePath)
        }
      } catch {}
    }
  }
  return undefined
}
