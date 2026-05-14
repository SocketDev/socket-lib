/**
 * @fileoverview `sbtFromVfs()` — extracts the SBT launcher jar from
 * the smol binary's VFS.
 *
 * Uses the post-alignment `getSmolVfs()` API. The smol-btm builder
 * packs only the launcher (~1.5 MB); the actual SBT distribution
 * downloads into the user's `~/.sbt/boot/` on first run when the
 * launcher reads `project/build.properties`.
 *
 * Returns `undefined` when the binary doesn't have SBT bundled.
 */

import { getSmolVfs } from '../../smol/vfs'

import type { ResolvedSbt } from './types'

/**
 * Relative VFS key for the bundled SBT launcher jar.
 */
export const SBT_VFS_KEY = 'sbt-launch.jar'

export async function sbtFromVfs(): Promise<ResolvedSbt | undefined> {
  const vfs = getSmolVfs()
  if (!vfs) {
    return undefined
  }
  /* c8 ignore start - smol Node binary only. */
  if (!vfs.has(SBT_VFS_KEY)) {
    return undefined
  }
  const realPath = await vfs.extract(SBT_VFS_KEY)
  return {
    path: realPath,
    isJar: true,
    source: 'vfs',
  }
  /* c8 ignore stop */
}
