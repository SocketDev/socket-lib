/**
 * @fileoverview Cache write entrypoints — `put` (insert/replace by
 * key) and `remove` (single-key delete). Both reject wildcards; for
 * pattern deletes use `clear({ prefix: 'foo*' })`.
 */

import { getSocketCacacheDir } from '../paths/socket'
import { TypeErrorCtor } from '../primordials/error'
import { StringPrototypeIncludes } from '../primordials/string'

import { getCacache } from './_internal'

import type { PutOptions } from './types'

/**
 * Put data into the Socket shared cache with a key.
 *
 * @throws {TypeError} If key contains wildcards (*)
 *
 * @example
 * ```typescript
 * await put('socket-sdk:scans:abc123', Buffer.from('result data'))
 * ```
 */
export async function put(
  key: string,
  data: string | Buffer,
  options?: PutOptions | undefined,
) {
  if (StringPrototypeIncludes(key, '*')) {
    throw new TypeErrorCtor(
      'Cache key cannot contain wildcards (*). Wildcards are only supported in clear({ prefix: "pattern*" }).',
    )
  }
  const cacache = getCacache()
  /* c8 ignore next - External cacache call */
  return await cacache.put(getSocketCacacheDir(), key, data, options)
}

/**
 * Remove an entry from the Socket shared cache by key.
 *
 * @throws {TypeError} If key contains wildcards (*)
 *
 * @example
 * ```typescript
 * await remove('socket-sdk:scans:abc123')
 * ```
 */
export async function remove(key: string): Promise<unknown> {
  if (StringPrototypeIncludes(key, '*')) {
    throw new TypeErrorCtor(
      'Cache key cannot contain wildcards (*). Use clear({ prefix: "pattern*" }) to remove multiple entries.',
    )
  }
  const cacache = getCacache() as any
  /* c8 ignore next - External cacache call */
  return await cacache.rm.entry(getSocketCacacheDir(), key)
}
