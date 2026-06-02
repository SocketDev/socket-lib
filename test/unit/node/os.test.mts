/**
 * @file Unit tests for src/node/os.ts.
 */

import { describe, expect, it } from 'vitest'

import { getNodeOs } from '../../../src/node/os'

describe('node/os', () => {
  it('returns the node:os module', () => {
    const os = getNodeOs()!
    expect(typeof os.platform).toBe('function')
    expect(typeof os.tmpdir).toBe('function')
    expect(typeof os.homedir).toBe('function')
  })

  it('is idempotent across repeated calls', () => {
    const first = getNodeOs()
    const second = getNodeOs()
    expect(first).toBe(second)
  })

  it('does not throw', () => {
    const call = () => getNodeOs()
    expect(call).not.toThrow()
  })
})
