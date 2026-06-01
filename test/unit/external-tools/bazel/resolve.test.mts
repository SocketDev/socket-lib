/**
 * @file Unit tests for resolveBazel() — orchestrator +
 * memoization.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  resetBazelResolution,
  resolveBazel,
} from '../../../../src/external-tools/bazel/resolve'

// resolveBazel() does real PATH/binary resolution; Windows CI agents can take
// >10s to return on a cold cache, blowing vitest's 10s default. Bump the
// per-test timeout, matching the jre/which win32-timeout fixes.
const RESOLVE_TIMEOUT = { timeout: 30_000 }

describe('external-tools/bazel/resolve', () => {
  beforeEach(() => {
    resetBazelResolution()
  })
  afterEach(() => {
    resetBazelResolution()
  })

  it('memoizes across calls', () => {
    const first = resolveBazel()
    const second = resolveBazel()
    expect(first).toBe(second)
  })

  it(
    'returns either a resolved shape or undefined on stock Node',
    RESOLVE_TIMEOUT,
    async () => {
      const result = await resolveBazel()
      if (result !== undefined) {
        expect(['vfs', 'path']).toContain(result.source)
      }
    },
  )

  it('resetBazelResolution clears the memo slot', RESOLVE_TIMEOUT, async () => {
    const first = await resolveBazel()
    resetBazelResolution()
    const second = await resolveBazel()
    expect(second).toEqual(first)
  })
})
