/**
 * @fileoverview Unit tests for src/node/url.ts.
 */

import { describe, expect, it } from 'vitest'

import { getNodeUrl } from '@socketsecurity/lib/node/url'

describe('node/url', () => {
  it('returns the node:url module', () => {
    const url = getNodeUrl()
    expect(typeof url.URL).toBe('function')
    expect(typeof url.fileURLToPath).toBe('function')
    expect(typeof url.pathToFileURL).toBe('function')
  })

  it('is idempotent across repeated calls', () => {
    expect(getNodeUrl()).toBe(getNodeUrl())
  })

  it('does not throw', () => {
    expect(() => getNodeUrl()).not.toThrow()
  })
})
