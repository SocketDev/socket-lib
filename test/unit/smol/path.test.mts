/**
 * @file Unit tests for src/smol/path.ts. On stock Node, `getSmolPath()` returns
 *   `undefined` (the node:smol-path binding ships only in socket-btm smol
 *   binaries). The native path is exercised by socket-btm's own tests.
 */

import { describe, expect, it } from 'vitest'

import { getSmolPath } from '../../../src/smol/path'

describe('smol/path', () => {
  describe('getSmolPath', () => {
    it('returns undefined on stock Node', () => {
      expect(getSmolPath()).toBe(undefined)
    })

    it('is idempotent across repeated calls', () => {
      expect(getSmolPath()).toBe(getSmolPath())
    })

    it('does not throw', () => {
      expect(() => getSmolPath()).not.toThrow()
    })
  })
})
