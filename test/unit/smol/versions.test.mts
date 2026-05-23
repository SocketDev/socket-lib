/**
 * @file Unit tests for src/smol/versions.ts. On stock Node, `getSmolVersions()`
 *   returns `undefined`. The smol- binary path is exercised by socket-btm's own
 *   tests running inside the smol binary.
 */

import { describe, expect, it } from 'vitest'

import { getSmolVersions } from '../../../src/smol/versions'

describe('smol/versions', () => {
  describe('getSmolVersions', () => {
    it('returns undefined on stock Node', () => {
      expect(getSmolVersions()).toBe(undefined)
    })

    it('is idempotent across repeated calls', () => {
      expect(getSmolVersions()).toBe(getSmolVersions())
    })

    it('does not throw', () => {
      expect(() => getSmolVersions()).not.toThrow()
    })
  })
})
