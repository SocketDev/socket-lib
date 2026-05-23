/**
 * @file Unit tests for jreFromPath(). Doesn't mock `which` — exercises the real
 *   resolver against the test runner's PATH. The assertion is shape-only ("if
 *   java exists on PATH, we return a resolved object; otherwise undefined")
 *   which is what callers actually care about.
 */

import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { jreFromPath } from '../../../../src/external-tools/jre/from-path'

describe('external-tools/jre/from-path', () => {
  it('returns either a resolved shape or undefined', async () => {
    const result = await jreFromPath()
    if (result !== undefined) {
      expect(result.source).toBe('path')
      expect(path.isAbsolute(result.javaPath)).toBe(true)
      expect(path.isAbsolute(result.javaHome)).toBe(true)
      expect(path.dirname(path.dirname(result.javaPath))).toBe(result.javaHome)
    }
  })
})
