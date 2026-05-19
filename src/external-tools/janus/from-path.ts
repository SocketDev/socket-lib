/**
 * @file `janusFromPath()` — looks for `janus` on the system PATH.
 */

import { which } from '../../bin/which'

import type { ResolvedJanus } from './types'

export async function janusFromPath(): Promise<ResolvedJanus | undefined> {
  const onPath = await which('janus', { nothrow: true })
  /* c8 ignore start - reached only when janus is NOT on PATH. */
  if (typeof onPath !== 'string') {
    return undefined
  }
  /* c8 ignore stop */
  return {
    path: onPath,
    source: 'path',
  }
}
