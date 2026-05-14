/**
 * @fileoverview `bazelFromVfs()` — extracts the Bazel binary from
 * the smol binary's VFS.
 *
 * Uses the post-alignment `getSmolVfs()` API. Returns `undefined`
 * when the binary doesn't have Bazel bundled (e.g. the linux-musl
 * SEAs don't carry Bazel because there's no native build for that
 * platform).
 */

import { getSmolVfs } from '../../smol/vfs'

import type { ResolvedBazel } from './types'

/**
 * Relative VFS key for the bundled Bazel binary.
 */
export const BAZEL_VFS_KEY = 'bazel'

export async function bazelFromVfs(): Promise<ResolvedBazel | undefined> {
  const vfs = getSmolVfs()
  if (!vfs || !vfs.has(BAZEL_VFS_KEY)) {
    return undefined
  }
  const realPath = await vfs.extract(BAZEL_VFS_KEY)
  return {
    path: realPath,
    source: 'vfs',
  }
}
