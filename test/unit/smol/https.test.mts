/**
 * @file Unit tests for src/smol/https.ts. On stock Node, `getSmolHttps()`
 *   returns `undefined`. The smol-binary path is exercised by socket-btm's own
 *   tests.
 */

import { getSmolHttps as getSmolHttpsStable } from '@socketsecurity/lib-stable/smol/https'
import { describe, expect, it } from 'vitest'

import { getSmolHttps } from '../../../src/smol/https'

describe('smol/https', () => {
  describe('getSmolHttps', () => {
    it('returns undefined on stock Node', () => {
      expect(getSmolHttps()).toBe(undefined)
    })

    it('is idempotent across repeated calls', () => {
      expect(getSmolHttps()).toBe(getSmolHttpsStable())
    })

    it('does not throw', () => {
      expect(() => getSmolHttps()).not.toThrow()
    })
  })
})
