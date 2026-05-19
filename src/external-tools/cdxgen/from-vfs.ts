/**
 * @file `cdxgenFromVfs()` — extracts cdxgen from the smol binary's VFS. Returns
 *   `undefined` when the binary doesn't carry a bundled cdxgen.
 */

import { getSmolVfs } from '../../smol/vfs'

import type { ResolvedCdxgen } from './types'

export const CDXGEN_VFS_KEY = 'cdxgen'

export async function cdxgenFromVfs(): Promise<ResolvedCdxgen | undefined> {
  const vfs = getSmolVfs()
  if (!vfs) {
    return undefined
  }
  /* c8 ignore start - smol Node binary only. */
  if (!vfs.has(CDXGEN_VFS_KEY)) {
    return undefined
  }
  const realPath = await vfs.extract(CDXGEN_VFS_KEY)
  return {
    path: realPath,
    source: 'vfs',
  }
  /* c8 ignore stop */
}
