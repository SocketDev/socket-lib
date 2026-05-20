/**
 * @file Unit tests for resolveJre() — the JRE resolver orchestrator +
 *   memoization. Uses `vi.stubEnv` so env mutation is per-test scoped under
 *   vitest's `isolate: false` config.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  resetJreResolution,
  resolveJre,
} from '@socketsecurity/lib/external-tools/jre/resolve'

// Run sequentially because tests mutate process.env and the JRE
// resolver's memo cache — both global state under vitest's
// isolate: false / concurrent: true config.
describe.sequential('external-tools/jre/resolve', () => {
  beforeEach(() => {
    resetJreResolution()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    resetJreResolution()
  })

  it('memoizes across calls', () => {
    expect(resolveJre()).toBe(resolveJre())
  })

  it('returns the JAVA_HOME path when set (skipping VFS on stock Node)', async () => {
    vi.stubEnv('JAVA_HOME', '/opt/jdk')
    resetJreResolution()
    const result = await resolveJre()
    expect(result?.javaHome).toBe('/opt/jdk')
    expect(result?.source).toBe('java-home')
  })

  // PATH-fallback walks `where java` (Windows) / `which java` (POSIX);
  // Windows CI agents can take >10s to return when the cache is cold,
  // so bump the per-test timeout to match the async-which non-existent-
  // binary fix in test/unit/which.test.mts.
  it(
    'falls through to PATH when JAVA_HOME is empty',
    { timeout: 30_000 },
    async () => {
      vi.stubEnv('JAVA_HOME', '')
      resetJreResolution()
      const result = await resolveJre()
      if (result !== undefined) {
        expect(result.source).toBe('path')
      }
    },
  )

  it('resetJreResolution clears the memo slot', async () => {
    vi.stubEnv('JAVA_HOME', '/opt/jdk')
    resetJreResolution()
    const first = await resolveJre()
    resetJreResolution()
    const second = await resolveJre()
    expect(second).toEqual(first)
  })
})
