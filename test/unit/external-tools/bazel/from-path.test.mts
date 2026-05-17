/**
 * @fileoverview Unit tests for bazelFromPath().
 */

import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { bazelFromPath } from '@socketsecurity/lib/external-tools/bazel/from-path'

describe('external-tools/bazel/from-path', () => {
  it('returns either a resolved shape or undefined', async () => {
    const result = await bazelFromPath()
    if (result !== undefined) {
      expect(result.source).toBe('path')
      expect(path.isAbsolute(result.path)).toBe(true)
    }
  })
})
