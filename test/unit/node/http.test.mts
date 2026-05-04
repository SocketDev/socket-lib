/**
 * @fileoverview Unit tests for src/node/http.ts.
 */

import { describe, expect, it } from 'vitest'

import { getNodeHttp } from '@socketsecurity/lib/node/http'

describe('node/http', () => {
  it('returns the node:http module', () => {
    const http = getNodeHttp()
    expect(typeof http.request).toBe('function')
    expect(typeof http.createServer).toBe('function')
  })

  it('is idempotent across repeated calls', () => {
    expect(getNodeHttp()).toBe(getNodeHttp())
  })

  it('does not throw', () => {
    expect(() => getNodeHttp()).not.toThrow()
  })
})
