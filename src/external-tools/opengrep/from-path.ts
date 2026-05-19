/**
 * @file `opengrepFromPath()` — looks for `opengrep` on the system PATH.
 */

import { which } from '../../bin/which'

import type { ResolvedOpengrep } from './types'

export async function opengrepFromPath(): Promise<
  ResolvedOpengrep | undefined
> {
  const onPath = await which('opengrep', { nothrow: true })
  /* c8 ignore start - reached only when opengrep is NOT on PATH. */
  if (typeof onPath !== 'string') {
    return undefined
  }
  /* c8 ignore stop */
  return {
    path: onPath,
    source: 'path',
  }
}
