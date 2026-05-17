/**
 * @fileoverview Unit tests for jreFromJavaHome().
 *
 * Uses vitest's `vi.stubEnv()` for env mutation — `process.env`
 * assignment races under vitest's `isolate: false` config, but
 * `stubEnv()` is properly scoped per-test.
 */

import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { jreFromJavaHome } from '@socketsecurity/lib/external-tools/jre/from-java-home'

// Run sequentially — stubEnv is process-scoped, races concurrently.
describe.sequential('external-tools/jre/from-java-home', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns undefined when JAVA_HOME is empty', () => {
    vi.stubEnv('JAVA_HOME', '')
    expect(jreFromJavaHome()).toBe(undefined)
  })

  it('builds a resolved-shape from JAVA_HOME', () => {
    vi.stubEnv('JAVA_HOME', '/opt/java')
    const result = jreFromJavaHome()!
    expect(result.javaHome).toBe('/opt/java')
    expect(result.source).toBe('java-home')
    expect(result.javaPath).toBe(
      path.join(
        '/opt/java',
        'bin',
        process.platform === 'win32' ? 'java.exe' : 'java',
      ),
    )
  })
})
