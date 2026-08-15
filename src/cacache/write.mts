/**
 * @file Cache write entrypoints — `put` inserts or replaces by key and
 *   `remove` deletes a single key. Both reject wildcards; for pattern
 *   deletes use `clear({ prefix: 'foo*' })`.
 */

import { getSocketCacacheDir } from '../paths/socket.mjs'
import { TypeErrorCtor } from '../primordials/error.mjs'
import { StringPrototypeIncludes } from '../primordials/string.mjs'

import { getCacache } from './shared.mjs'

import type { PutOptions } from './types.mjs'

/**
 * Put data into the Socket shared cache with a key.
 *
 * @example
 *   ;```typescript
 *   await put('socket-sdk:scans:abc123', Buffer.from('result data'))
 *   ```
 *
 * @throws {TypeError} If key contains wildcards (*)
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
 * @example
 *   ;```typescript
 *   await remove('socket-sdk:scans:abc123')
 *   ```
 *
 * @throws {TypeError} If key contains wildcards (*)
 */
// oxlint-disable-next-line socket/exported-name-has-domain-word -- published leaf API; the module path carries the domain
export async function remove(key: string): Promise<unknown> {
  if (StringPrototypeIncludes(key, '*')) {
    throw new TypeErrorCtor(
      'Cache key cannot contain wildcards (*). Use clear({ prefix: "pattern*" }) to remove multiple entries.',
    )
  }
  const cacache = getCacache()
  /* c8 ignore next - External cacache call */
  return await cacache.rm.entry(getSocketCacacheDir(), key)
}
