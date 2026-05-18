/**
 * @file Unit tests for src/smol/vfs.ts. On stock Node, `getSmolVfs()` returns
 *   `undefined`. The smol-binary path is exercised by socket-btm's own tests.
 */

import { describe, expect, it } from 'vitest'

import { getSmolVfs } from '@socketsecurity/lib/smol/vfs'

describe('smol/vfs', () => {
  describe('getSmolVfs', () => {
    it('returns undefined on stock Node', () => {
      expect(getSmolVfs()).toBe(undefined)
    })

    it('is idempotent across repeated calls', () => {
      expect(getSmolVfs()).toBe(getSmolVfs())
    })

    it('does not throw', () => {
      expect(() => getSmolVfs()).not.toThrow()
    })
  })
})
