/**
 * @file `synpFromPath()` — looks for `synp` on the system PATH.
 */

import { which } from '../../exe/path/which.mjs'

import type { ResolvedSynp } from './types.mjs'

export async function synpFromPath(): Promise<ResolvedSynp | undefined> {
  const onPath = await which('synp', { nothrow: true })
  /* c8 ignore start - reached only when synp is NOT on PATH. */
  if (typeof onPath !== 'string') {
    return undefined
  }
  /* c8 ignore stop */
  return {
    path: onPath,
    source: 'path',
  }
}
