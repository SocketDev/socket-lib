/**
 * @file Unit tests for src/smol/http.ts. On stock Node, `getSmolHttp()` returns
 *   `undefined`. The smol-binary path is exercised by socket-btm's own tests
 *   running inside the smol binary.
 */

import { describe, expect, it } from 'vitest'

import { getSmolHttp } from '@socketsecurity/lib/smol/http'

describe('smol/http', () => {
  describe('getSmolHttp', () => {
    it('returns undefined on stock Node', () => {
      expect(getSmolHttp()).toBe(undefined)
    })

    it('is idempotent across repeated calls', () => {
      expect(getSmolHttp()).toBe(getSmolHttp())
    })

    it('does not throw', () => {
      expect(() => getSmolHttp()).not.toThrow()
    })
  })
})
