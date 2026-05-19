/**
 * @file `trufflehogFromPath()` — looks for `trufflehog` on the system PATH via
 *   socket-lib's `which`. Returns the resolved-shape object if found; otherwise
 *   `undefined`.
 */

import { which } from '../../bin/which'

import type { ResolvedTrufflehog } from './types'

export async function trufflehogFromPath(): Promise<
  ResolvedTrufflehog | undefined
> {
  const onPath = await which('trufflehog', { nothrow: true })
  /* c8 ignore start - reached only when trufflehog is NOT on PATH. */
  if (typeof onPath !== 'string') {
    return undefined
  }
  /* c8 ignore stop */
  return {
    path: onPath,
    source: 'path',
  }
}
