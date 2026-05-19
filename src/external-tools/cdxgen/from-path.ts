/**
 * @file `cdxgenFromPath()` — looks for `cdxgen` on the system PATH.
 */

import { which } from '../../bin/which'

import type { ResolvedCdxgen } from './types'

export async function cdxgenFromPath(): Promise<ResolvedCdxgen | undefined> {
  const onPath = await which('cdxgen', { nothrow: true })
  /* c8 ignore start - reached only when cdxgen is NOT on PATH. */
  if (typeof onPath !== 'string') {
    return undefined
  }
  /* c8 ignore stop */
  return {
    path: onPath,
    source: 'path',
  }
}
