/**
 * @file Unit tests for src/smol/manifest.ts. On stock Node, `getSmolManifest()`
 *   returns `undefined`. The integration story is verified by socket-btm's own
 *   tests running inside the smol binary.
 */

import { describe, expect, it } from 'vitest'

import { getSmolManifest } from '../../../src/smol/manifest'

describe('smol/manifest', () => {
  describe('getSmolManifest', () => {
    it('returns undefined on stock Node', () => {
      expect(getSmolManifest()).toBe(undefined)
    })

    it('is idempotent across repeated calls', () => {
      const first = getSmolManifest()
      const second = getSmolManifest()
      expect(first).toBe(second)
    })

    it('does not throw', () => {
      expect(() => getSmolManifest()).not.toThrow()
    })
  })
})
