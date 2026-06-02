/**
 * @file Unit tests for src/node/http.ts.
 */

import { describe, expect, it } from 'vitest'

import { getNodeHttp } from '../../../src/node/http'

describe('node/http', () => {
  it('returns the node:http module', () => {
    const http = getNodeHttp()!
    expect(typeof http.request).toBe('function')
    expect(typeof http.createServer).toBe('function')
  })

  it('is idempotent across repeated calls', () => {
    const first = getNodeHttp()
    const second = getNodeHttp()
    expect(first).toBe(second)
  })

  it('does not throw', () => {
    const call = () => getNodeHttp()
    expect(call).not.toThrow()
  })
})
