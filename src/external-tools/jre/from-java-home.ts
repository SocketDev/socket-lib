/**
 * @fileoverview `jreFromJavaHome()` — checks `$JAVA_HOME` for an
 * existing JRE/JDK. Returns the resolved-shape object if the env var
 * is set; otherwise `undefined`.
 *
 * Does NOT verify that the path actually contains a working `bin/java`
 * — that's the caller's job (or the spawn will fail loudly at the
 * use site). Keeping this leaf cheap means socket-cli can call it
 * unconditionally without paying a stat per resolution.
 */

import path from 'node:path'
import process from 'node:process'

import type { ResolvedJre } from './types'

export function jreFromJavaHome(): ResolvedJre | undefined {
  const javaHomeEnv = process.env['JAVA_HOME']
  if (!javaHomeEnv) {
    return undefined
  }
  const javaPath = path.join(
    javaHomeEnv,
    'bin',
    process.platform === 'win32' ? 'java.exe' : 'java',
  )
  return {
    javaPath,
    javaHome: javaHomeEnv,
    source: 'java-home',
  }
}
