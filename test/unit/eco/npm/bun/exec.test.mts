/**
 * @fileoverview Unit tests for src/eco/npm/bun/exec.ts.
 *
 * The function is a stub that throws to signal "not yet implemented".
 * The test asserts the documented behavior so future implementers
 * see this fail when they wire up the real implementation.
 */

import { describe, expect, it } from 'vitest'

import { execBun } from '@socketsecurity/lib-stable/eco/npm/bun/exec'

describe('eco/npm/bun/exec', () => {
  it('throws with a not-implemented message', () => {
    expect(() => execBun([])).toThrow(/not yet implemented/)
  })

  it('ignores any options passed in (still throws)', () => {
    expect(() => execBun(['install'], { cwd: '/tmp' })).toThrow()
  })
})
