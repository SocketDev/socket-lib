/**
 * @file `janusFromVfs()` — extracts the janus binary from the smol binary's
 *   VFS. Returns `undefined` when the binary doesn't have janus bundled.
 */

import { getSmolVfs } from '../../smol/vfs'

import type { ResolvedJanus } from './types'

export const JANUS_VFS_KEY = 'janus'

export async function janusFromVfs(): Promise<ResolvedJanus | undefined> {
  const vfs = getSmolVfs()
  if (!vfs) {
    return undefined
  }
  /* c8 ignore start - smol Node binary only. */
  if (!vfs.has(JANUS_VFS_KEY)) {
    return undefined
  }
  const realPath = await vfs.extract(JANUS_VFS_KEY)
  return {
    path: realPath,
    source: 'vfs',
  }
  /* c8 ignore stop */
}
