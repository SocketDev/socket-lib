/**
 * @file Unit tests for src/exe/smol/vfs.ts. On stock Node, `getSmolVfs()` returns
 *   `undefined`. The smol-binary path is exercised by socket-btm's own tests.
 */

import { getSmolVfs as getSmolVfsStable } from '@socketsecurity/lib-stable/exe/smol/vfs'
import { describe, expect, it } from 'vitest'

import { getSmolVfs } from '../../../../src/exe/smol/vfs.mjs'

describe('smol/vfs', () => {
  describe('getSmolVfs', () => {
    it('returns undefined on stock Node', () => {
      expect(getSmolVfs()).toBe(undefined)
    })

    it('is idempotent across repeated calls', () => {
      expect(getSmolVfs()).toBe(getSmolVfsStable())
    })

    it('does not throw', () => {
      expect(() => getSmolVfs()).not.toThrow()
    })
  })
})
