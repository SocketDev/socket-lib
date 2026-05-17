/**
 * @fileoverview Unit tests for src/smol/purl.ts.
 *
 * On stock Node, `getSmolPurl()` returns `undefined`. The integration
 * story is verified by socket-btm's own tests running inside the smol
 * binary.
 */

import { describe, expect, it } from 'vitest'

import { getSmolPurl } from '@socketsecurity/lib/smol/purl'

describe('smol/purl', () => {
  describe('getSmolPurl', () => {
    it('returns undefined on stock Node', () => {
      expect(getSmolPurl()).toBe(undefined)
    })

    it('is idempotent across repeated calls', () => {
      expect(getSmolPurl()).toBe(getSmolPurl())
    })

    it('does not throw', () => {
      expect(() => getSmolPurl()).not.toThrow()
    })
  })
})
