/**
 * @fileoverview `sbtFromPath()` — looks for the `sbt` shell script on
 * the system PATH. Returns it as a direct-executable launcher (the
 * script knows how to find a JRE itself, so the caller doesn't need
 * to resolve one).
 *
 * Returns `undefined` if `sbt` isn't on PATH.
 */

import { which } from '../../bin/which'

import type { ResolvedSbt } from './types'

export async function sbtFromPath(): Promise<ResolvedSbt | undefined> {
  const sbt = await which('sbt', { nothrow: true })
  if (typeof sbt !== 'string') {
    return undefined
  }
  return {
    path: sbt,
    isJar: false,
    source: 'path',
  }
}
