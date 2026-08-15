/**
 * @file Unit tests for src/exe/smol/primordial.ts. On stock Node,
 *   `getSmolPrimordial()` returns `undefined`. The integration story is
 *   verified by socket-btm's own tests running inside the smol binary.
 */

import { getSmolPrimordial as getSmolPrimordialStable } from '@socketsecurity/lib-stable/smol/primordial'
import { describe, expect, it } from 'vitest'

import { getSmolPrimordial } from '../../../../src/exe/smol/primordial.mjs'

describe('smol/primordial', () => {
  describe('getSmolPrimordial', () => {
    it('returns undefined on stock Node', () => {
      expect(getSmolPrimordial()).toBe(undefined)
    })

    it('is idempotent across repeated calls', () => {
      expect(getSmolPrimordial()).toBe(getSmolPrimordialStable())
    })

    it('does not throw', () => {
      expect(() => getSmolPrimordial()).not.toThrow()
    })
  })
})
