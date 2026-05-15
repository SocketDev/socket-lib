/**
 * @fileoverview Unit tests for sbtFromPath().
 */

import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { sbtFromPath } from '@socketsecurity/lib-stable/external-tools/sbt/from-path'

describe('external-tools/sbt/from-path', () => {
  it('returns either a resolved shape or undefined', async () => {
    const result = await sbtFromPath()
    if (result !== undefined) {
      expect(result.source).toBe('path')
      expect(result.isJar).toBe(false)
      expect(path.isAbsolute(result.path)).toBe(true)
    }
  })
})
