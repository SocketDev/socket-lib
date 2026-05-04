/**
 * @fileoverview Unit tests for src/node/os.ts.
 */

import { describe, expect, it } from 'vitest'

import { getNodeOs } from '@socketsecurity/lib/node/os'

describe('node/os', () => {
  it('returns the node:os module', () => {
    const os = getNodeOs()
    expect(typeof os.platform).toBe('function')
    expect(typeof os.tmpdir).toBe('function')
    expect(typeof os.homedir).toBe('function')
  })

  it('is idempotent across repeated calls', () => {
    expect(getNodeOs()).toBe(getNodeOs())
  })

  it('does not throw', () => {
    expect(() => getNodeOs()).not.toThrow()
  })
})
