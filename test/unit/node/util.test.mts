/**
 * @fileoverview Unit tests for src/node/util.ts.
 */

import { describe, expect, it } from 'vitest'

import { getNodeUtil } from '@socketsecurity/lib/node/util'

describe('node/util', () => {
  it('returns the node:util module', () => {
    const util = getNodeUtil()
    expect(typeof util.promisify).toBe('function')
    expect(typeof util.inspect).toBe('function')
    expect(typeof util.format).toBe('function')
  })

  it('is idempotent across repeated calls', () => {
    expect(getNodeUtil()).toBe(getNodeUtil())
  })

  it('does not throw', () => {
    expect(() => getNodeUtil()).not.toThrow()
  })
})
