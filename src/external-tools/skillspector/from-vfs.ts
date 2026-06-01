/**
 * @file `skillspectorFromVfs()` — extracts SkillSpector from the smol Node
 *   VFS if it's bundled. Returns `undefined` when the binary doesn't carry
 *   skillspector.
 */

import { getSmolVfs } from '../../smol/vfs'

import type { ResolvedSkillSpector } from './types'

export const SKILLSPECTOR_VFS_KEY = 'skillspector'

export async function skillspectorFromVfs(): Promise<
  ResolvedSkillSpector | undefined
> {
  const vfs = getSmolVfs()
  if (!vfs) {
    return undefined
  }
  /* c8 ignore start - smol Node binary only. */
  if (!vfs.has(SKILLSPECTOR_VFS_KEY)) {
    return undefined
  }
  const realPath = await vfs.extract(SKILLSPECTOR_VFS_KEY)
  return { path: realPath, source: 'vfs' }
  /* c8 ignore stop */
}
