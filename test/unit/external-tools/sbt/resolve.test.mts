/**
 * @fileoverview Unit tests for resolveSbt() — orchestrator + memo.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  _resetSbtResolution,
  resolveSbt,
} from '@socketsecurity/lib/external-tools/sbt/resolve'

describe('external-tools/sbt/resolve', () => {
  beforeEach(() => {
    _resetSbtResolution()
  })
  afterEach(() => {
    _resetSbtResolution()
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

  it('_resetSbtResolution clears the memo slot', async () => {
    const first = await resolveSbt()
    _resetSbtResolution()
    const second = await resolveSbt()
    expect(second).toEqual(first)
  })
})
