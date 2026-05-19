/**
 * @file `uvFromPath()` — looks for `uv` on the system PATH.
 */

import { which } from '../../bin/which'

import type { ResolvedUv } from './types'

export async function uvFromPath(): Promise<ResolvedUv | undefined> {
  const onPath = await which('uv', { nothrow: true })
  /* c8 ignore start - reached only when uv is NOT on PATH. */
  if (typeof onPath !== 'string') {
    return undefined
  }
  /* c8 ignore stop */
  return {
    path: onPath,
    source: 'path',
  }
}
