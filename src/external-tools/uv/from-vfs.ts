/**
 * @file `uvFromVfs()` — extracts the uv binary from the smol binary's VFS.
 *   Returns `undefined` when the binary doesn't have uv bundled.
 */

import { getSmolVfs } from '../../smol/vfs'

import type { ResolvedUv } from './types'

export const UV_VFS_KEY = 'uv'

export async function uvFromVfs(): Promise<ResolvedUv | undefined> {
  const vfs = getSmolVfs()
  if (!vfs) {
    return undefined
  }
  /* c8 ignore start - smol Node binary only. */
  if (!vfs.has(UV_VFS_KEY)) {
    return undefined
  }
  const realPath = await vfs.extract(UV_VFS_KEY)
  return {
    path: realPath,
    source: 'vfs',
  }
  /* c8 ignore stop */
}
