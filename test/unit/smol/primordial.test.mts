/**
 * @fileoverview Unit tests for src/smol/primordial.ts.
 *
 * On stock Node, `getSmolPrimordial()` returns `undefined`. The
 * integration story is verified by socket-btm's own tests running
 * inside the smol binary.
 */

import { describe, expect, it } from 'vitest'

import { getSmolPrimordial } from '@socketsecurity/lib/smol/primordial'

describe('smol/primordial', () => {
  describe('getSmolPrimordial', () => {
    it('returns undefined on stock Node', () => {
      expect(getSmolPrimordial()).toBe(undefined)
    })

    it('is idempotent across repeated calls', () => {
      expect(getSmolPrimordial()).toBe(getSmolPrimordial())
    })

    it('does not throw', () => {
      expect(() => getSmolPrimordial()).not.toThrow()
    })
  })
})
