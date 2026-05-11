/**
 * @fileoverview Cache read entrypoints — `get` (throws on miss) and
 * `safeGet` (returns `undefined` on miss). Both reject keys containing
 * wildcards; bulk reads go through `clear` / `ls` patterns.
 */

import { getSocketCacacheDir } from '../paths/socket'
import { TypeErrorCtor } from '../primordials/error'
import { StringPrototypeIncludes } from '../primordials/string'

import { getCacache } from './accessor'

import type { CacheEntry, GetOptions } from './types'

/**
 * Get data from the Socket shared cache by key.
 * @throws {Error} When cache entry is not found.
 * @throws {TypeError} If key contains wildcards (*)
 *
 * @example
 * ```typescript
 * const entry = await get('socket-sdk:scans:abc123')
 * console.log(entry.data.toString('utf8'))
 * ```
 */
export async function get(
  key: string,
  options?: GetOptions | undefined,
): Promise<CacheEntry> {
  if (StringPrototypeIncludes(key, '*')) {
    throw new TypeErrorCtor(
      'Cache key cannot contain wildcards (*). Wildcards are only supported in clear({ prefix: "pattern*" }).',
    )
  }
  const cacache = getCacache() as any
  /* c8 ignore next - External cacache call */
  return await cacache.get(getSocketCacacheDir(), key, options)
}

/**
 * Get data from the Socket shared cache by key without throwing.
 *
 * @example
 * ```typescript
 * const entry = await safeGet('socket-sdk:scans:abc123')
 * if (entry) {
 *   console.log(entry.data.toString('utf8'))
 * }
 * ```
 */
export async function safeGet(
  key: string,
  options?: GetOptions | undefined,
): Promise<CacheEntry | undefined> {
  try {
    return await get(key, options)
  } catch {
    return undefined
  }
}
