/**
 * @file `trufflehogFromVfs()` — extracts the TruffleHog binary from the smol
 *   binary's VFS. Returns `undefined` when the binary doesn't have TruffleHog
 *   bundled.
 */

import { getSmolVfs } from '../../smol/vfs'

import type { ResolvedTrufflehog } from './types'

/**
 * Relative VFS key for the bundled TruffleHog binary.
 */
export const TRUFFLEHOG_VFS_KEY = 'trufflehog'

export async function trufflehogFromVfs(): Promise<
  ResolvedTrufflehog | undefined
> {
  const vfs = getSmolVfs()
  if (!vfs) {
    return undefined
  }
  /* c8 ignore start - smol Node binary only. */
  if (!vfs.has(TRUFFLEHOG_VFS_KEY)) {
    return undefined
  }
  const realPath = await vfs.extract(TRUFFLEHOG_VFS_KEY)
  return {
    path: realPath,
    source: 'vfs',
  }
  /* c8 ignore stop */
}
