/**
 * @file `trivyFromVfs()` — extracts the Trivy binary from the smol binary's
 *   VFS. Returns `undefined` when the binary doesn't have Trivy bundled.
 */

import { getSmolVfs } from '../../smol/vfs'

import type { ResolvedTrivy } from './types'

export const TRIVY_VFS_KEY = 'trivy'

export async function trivyFromVfs(): Promise<ResolvedTrivy | undefined> {
  const vfs = getSmolVfs()
  if (!vfs) {
    return undefined
  }
  /* c8 ignore start - smol Node binary only. */
  if (!vfs.has(TRIVY_VFS_KEY)) {
    return undefined
  }
  const realPath = await vfs.extract(TRIVY_VFS_KEY)
  return {
    path: realPath,
    source: 'vfs',
  }
  /* c8 ignore stop */
}
