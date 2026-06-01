/**
 * @file Unit tests for src/smol/http.ts. On stock Node, `getSmolHttp()` returns
 *   `undefined`. The smol-binary path is exercised by socket-btm's own tests
 *   running inside the smol binary.
 */

import { describe, expect, it } from 'vitest'

import { getSmolHttp } from '../../../src/smol/http'

describe('smol/http', () => {
  describe('getSmolHttp', () => {
    it('returns undefined on stock Node', () => {
      const result = getSmolHttp()
      expect(result).toBe(undefined)
    })

    it('is idempotent across repeated calls', () => {
      const first = getSmolHttp()
      const second = getSmolHttp()
      expect(first).toBe(second)
    })

    it('does not throw', () => {
      const call = () => getSmolHttp()
      expect(call).not.toThrow()
    })
  })
})
