/**
 * @file `opengrepFromVfs()` — extracts the OpenGrep binary from the smol
 *   binary's VFS. Returns `undefined` when the binary doesn't have OpenGrep
 *   bundled.
 */

import { getSmolVfs } from '../../smol/vfs'

import type { ResolvedOpengrep } from './types'

export const OPENGREP_VFS_KEY = 'opengrep'

export async function opengrepFromVfs(): Promise<ResolvedOpengrep | undefined> {
  const vfs = getSmolVfs()
  if (!vfs) {
    return undefined
  }
  /* c8 ignore start - smol Node binary only. */
  if (!vfs.has(OPENGREP_VFS_KEY)) {
    return undefined
  }
  const realPath = await vfs.extract(OPENGREP_VFS_KEY)
  return {
    path: realPath,
    source: 'vfs',
  }
  /* c8 ignore stop */
}
