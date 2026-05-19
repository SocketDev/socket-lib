/**
 * @file `synpFromVfs()` — extracts synp from the smol binary's VFS. Returns
 *   `undefined` when the binary doesn't carry a bundled synp.
 */

import { getSmolVfs } from '../../smol/vfs'

import type { ResolvedSynp } from './types'

export const SYNP_VFS_KEY = 'synp'

export async function synpFromVfs(): Promise<ResolvedSynp | undefined> {
  const vfs = getSmolVfs()
  if (!vfs) {
    return undefined
  }
  /* c8 ignore start - smol Node binary only. */
  if (!vfs.has(SYNP_VFS_KEY)) {
    return undefined
  }
  const realPath = await vfs.extract(SYNP_VFS_KEY)
  return {
    path: realPath,
    source: 'vfs',
  }
  /* c8 ignore stop */
}
