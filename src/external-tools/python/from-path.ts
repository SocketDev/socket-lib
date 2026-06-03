/**
 * @file `pythonFromPath()` — looks for a CPython interpreter on the system
 *   PATH. Tries `python3` first (the POSIX convention), then `python` (the
 *   Windows convention / some minimal images). Returns the first hit.
 */

import { which } from '../../bin/which'

import type { ResolvedPython } from './types'

export async function pythonFromPath(): Promise<ResolvedPython | undefined> {
  for (const bin of ['python3', 'python']) {
    // eslint-disable-next-line no-await-in-loop
    const onPath = await which(bin, { nothrow: true })
    if (typeof onPath === 'string') {
      return { path: onPath, source: 'path' }
    }
  }
  return undefined
}
