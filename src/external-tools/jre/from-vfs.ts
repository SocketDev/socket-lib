/**
 * @fileoverview `jreFromVfs()` — extracts the JRE directory tree
 * from the smol binary's VFS and returns the resolved-shape pointing
 * into the extracted directory.
 *
 * Uses the post-alignment `getSmolVfs()` API (matches upstream
 * `node:vfs`). Returns `undefined` when:
 *   - Not running on a smol binary with the aligned binding
 *   - The binary has no SEA payload (`getSmolVfs() === undefined`)
 *   - The `jre` key doesn't exist in the payload
 */

import path from 'node:path'
import process from 'node:process'

import { getSmolVfs } from '../../smol/vfs'

import type { ResolvedJre } from './types'

/**
 * Relative VFS key for the bundled JRE. Passed as a bare suffix to
 * `vfs.extract()` — the binding handles prefix concatenation.
 */
export const JRE_VFS_KEY = 'jre'

export async function jreFromVfs(): Promise<ResolvedJre | undefined> {
  const vfs = getSmolVfs()
  if (!vfs || !vfs.has(JRE_VFS_KEY)) {
    return undefined
  }
  const javaHome = await vfs.extract(JRE_VFS_KEY)
  return {
    javaPath: path.join(
      javaHome,
      'bin',
      process.platform === 'win32' ? 'java.exe' : 'java',
    ),
    javaHome,
    source: 'vfs',
  }
}
