/**
 * @file `jreFromJavaHome()` — checks `$JAVA_HOME` for an existing JRE/JDK.
 *   Returns the resolved-shape object if the env var is set; otherwise
 *   `undefined`. Does NOT verify that the path actually contains a working
 *   `bin/java` — that's the caller's job (or the spawn will fail loudly at the
 *   use site). Keeping this leaf cheap means socket-cli can call it
 *   unconditionally without paying a stat per resolution.
 */

import type { ResolvedJre } from './types.mjs'
import { getNodePath } from '../../node/path.mjs'
import { getNodeProcess } from '../../node/process.mjs'

export function jreFromJavaHome(): ResolvedJre | undefined {
  const nodeProcess = getNodeProcess()
  const javaHomeEnv = nodeProcess.env['JAVA_HOME']
  if (!javaHomeEnv) {
    return undefined
  }
  const path = getNodePath()
  const javaPath = path.join(
    javaHomeEnv,
    'bin',
    nodeProcess.platform === 'win32' ? 'java.exe' : 'java',
  )
  return {
    javaPath,
    javaHome: javaHomeEnv,
    source: 'java-home',
  }
}
