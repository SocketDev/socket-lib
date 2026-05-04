/**
 * @fileoverview Unit tests for src/node/crypto.ts.
 */

import { describe, expect, it } from 'vitest'

import { getNodeCrypto } from '@socketsecurity/lib/node/crypto'

describe('node/crypto', () => {
  it('returns the node:crypto module', () => {
    const crypto = getNodeCrypto()
    expect(typeof crypto.createHash).toBe('function')
    expect(typeof crypto.randomBytes).toBe('function')
  })

  it('is idempotent across repeated calls', () => {
    expect(getNodeCrypto()).toBe(getNodeCrypto())
  })

  it('does not throw', () => {
    expect(() => getNodeCrypto()).not.toThrow()
  })
})
