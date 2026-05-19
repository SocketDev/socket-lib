/**
 * @file Unit tests for resolveBazel() — orchestrator +
 * memoization.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  resetBazelResolution,
  resolveBazel,
} from '@socketsecurity/lib/external-tools/bazel/resolve'

describe('external-tools/bazel/resolve', () => {
  beforeEach(() => {
    resetBazelResolution()
  })
  afterEach(() => {
    resetBazelResolution()
  })

  it('memoizes across calls', () => {
    expect(resolveBazel()).toBe(resolveBazel())
  })

  it('returns either a resolved shape or undefined on stock Node', async () => {
    const result = await resolveBazel()
    if (result !== undefined) {
      expect(['vfs', 'path']).toContain(result.source)
    }
  })

  it('resetBazelResolution clears the memo slot', async () => {
    const first = await resolveBazel()
    resetBazelResolution()
    const second = await resolveBazel()
    expect(second).toEqual(first)
  })
})
