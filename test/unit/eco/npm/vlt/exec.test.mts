/**
 * @fileoverview Unit tests for src/eco/npm/vlt/exec.ts.
 *
 * The function is a stub that throws to signal "not yet implemented".
 * The test asserts the documented behavior so future implementers
 * see this fail when they wire up the real implementation.
 */

import { describe, expect, it } from 'vitest'

import { execVlt } from '@socketsecurity/lib-stable/eco/npm/vlt/exec'

describe('eco/npm/vlt/exec', () => {
  it('throws with a not-implemented message', () => {
    expect(() => execVlt([])).toThrow(/not yet implemented/)
  })

  it('ignores any options passed in (still throws)', () => {
    expect(() => execVlt(['install'], { cwd: '/tmp' })).toThrow()
  })
})
