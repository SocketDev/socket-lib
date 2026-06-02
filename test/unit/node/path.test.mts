/**
 * @file Unit tests for src/node/path.ts.
 */

import { describe, expect, it } from 'vitest'

// oxlint-disable-next-line socket/no-src-import-in-test-expect -- getNodePath is the system-under-test; the assertions exercise its return value and idempotent identity, not a builder of expected values.
import { getNodePath } from '../../../src/node/path'

describe('node/path', () => {
  it('returns the node:path module', () => {
    const path = getNodePath()!
    expect(typeof path.join).toBe('function')
    expect(typeof path.resolve).toBe('function')
    expect(typeof path.sep).toBe('string')
  })

  it('is idempotent across repeated calls', () => {
    expect(getNodePath()).toBe(getNodePath())
  })

  it('does not throw', () => {
    expect(() => getNodePath()).not.toThrow()
  })
})
