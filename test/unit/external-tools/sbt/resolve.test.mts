/**
 * @file Unit tests for resolveSbt() — orchestrator + memo.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  resetSbtResolution,
  resolveSbt,
} from '../../../../src/external-tools/sbt/resolve'

// resolveSbt() does real PATH/binary resolution; Windows CI agents can take
// >10s to return on a cold cache, blowing vitest's 10s default. Bump the
// per-test timeout, matching the jre/which win32-timeout fixes.
const RESOLVE_TIMEOUT = { timeout: 30_000 }

describe('external-tools/sbt/resolve', () => {
  beforeEach(() => {
    resetSbtResolution()
  })
  afterEach(() => {
    resetSbtResolution()
  })

  it('memoizes across calls', () => {
    expect(resolveSbt()).toBe(resolveSbt())
  })

  it(
    'returns either a resolved shape or undefined on stock Node',
    RESOLVE_TIMEOUT,
    async () => {
      const result = await resolveSbt()
      if (result !== undefined) {
        expect(['vfs', 'path']).toContain(result.source)
      }
    },
  )

  it('resetSbtResolution clears the memo slot', RESOLVE_TIMEOUT, async () => {
    const first = await resolveSbt()
    resetSbtResolution()
    const second = await resolveSbt()
    expect(second).toEqual(first)
  })
})
