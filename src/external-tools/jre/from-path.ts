/**
 * @fileoverview `jreFromPath()` — looks for `java` (or `java.exe`)
 * on the system PATH via socket-lib's `which`. Returns the resolved-
 * shape object if found; otherwise `undefined`.
 *
 * Derives `javaHome` by walking up two directories from the resolved
 * `java` path (`<javaHome>/bin/java`). That's the JDK/JRE convention
 * every distribution follows.
 */

import path from 'node:path'

import { which } from '../../bin/which'

import type { ResolvedJre } from './types'

export async function jreFromPath(): Promise<ResolvedJre | undefined> {
  const javaOnPath = await which('java', { nothrow: true })
  /* c8 ignore start - reached only when java is NOT on PATH. */
  if (typeof javaOnPath !== 'string') {
    return undefined
  }
  /* c8 ignore stop */
  return {
    javaPath: javaOnPath,
    javaHome: path.dirname(path.dirname(javaOnPath)),
    source: 'path',
  }
}
