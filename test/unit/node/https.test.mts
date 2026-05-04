/**
 * @fileoverview Unit tests for src/node/https.ts.
 */

import { describe, expect, it } from 'vitest'

import { getNodeHttps } from '@socketsecurity/lib/node/https'

describe('node/https', () => {
  it('returns the node:https module', () => {
    const https = getNodeHttps()
    expect(typeof https.request).toBe('function')
    expect(typeof https.createServer).toBe('function')
  })

  it('is idempotent across repeated calls', () => {
    expect(getNodeHttps()).toBe(getNodeHttps())
  })

  it('does not throw', () => {
    expect(() => getNodeHttps()).not.toThrow()
  })
})
