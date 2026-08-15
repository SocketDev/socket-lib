/**
 * @file Unit tests for src/exe/smol/versions.ts. On stock Node, `getSmolVersions()`
 *   returns `undefined`. The smol- binary path is exercised by socket-btm's own
 *   tests running inside the smol binary.
 */

import { describe, expect, it } from 'vitest'

import { getSmolVersions } from '../../../../src/exe/smol/versions.mjs'

describe('smol/versions', () => {
  describe('getSmolVersions', () => {
    it('returns undefined on stock Node', () => {
      const result = getSmolVersions()
      expect(result).toBe(undefined)
    })

    it('is idempotent across repeated calls', () => {
      const first = getSmolVersions()
      const second = getSmolVersions()
      expect(first).toBe(second)
    })

    it('does not throw', () => {
      const run = () => getSmolVersions()
      expect(run).not.toThrow()
    })
  })
})
