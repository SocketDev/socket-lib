/**
 * @file Unit tests for src/node/crypto.ts.
 */

import { describe, expect, it } from 'vitest'

import { getNodeCrypto } from '../../../src/node/crypto'

describe('node/crypto', () => {
  it('returns the node:crypto module', () => {
    const crypto = getNodeCrypto()!
    expect(typeof crypto.createHash).toBe('function')
    expect(typeof crypto.randomBytes).toBe('function')
  })

  it('is idempotent across repeated calls', () => {
    const first = getNodeCrypto()
    const second = getNodeCrypto()
    expect(first).toBe(second)
  })

  it('does not throw', () => {
    let error: unknown
    try {
      getNodeCrypto()
    } catch (e) {
      error = e
    }
    expect(error).toBeUndefined()
  })
})
