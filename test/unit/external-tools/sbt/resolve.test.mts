/**
 * @file Unit tests for resolveSbt() — orchestrator + memo.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  resetSbtResolution,
  resolveSbt,
} from '../../../../src/external-tools/sbt/resolve'

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

  it('returns either a resolved shape or undefined on stock Node', async () => {
    const result = await resolveSbt()
    if (result !== undefined) {
      expect(['vfs', 'path']).toContain(result.source)
    }
  })

  it('resetSbtResolution clears the memo slot', async () => {
    const first = await resolveSbt()
    resetSbtResolution()
    const second = await resolveSbt()
    expect(second).toEqual(first)
  })
})
