/**
 * @file `trivyFromPath()` — looks for `trivy` on the system PATH.
 */

import { which } from '../../bin/which'

import type { ResolvedTrivy } from './types'

export async function trivyFromPath(): Promise<ResolvedTrivy | undefined> {
  const onPath = await which('trivy', { nothrow: true })
  /* c8 ignore start - reached only when trivy is NOT on PATH. */
  if (typeof onPath !== 'string') {
    return undefined
  }
  /* c8 ignore stop */
  return {
    path: onPath,
    source: 'path',
  }
}
