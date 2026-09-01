/**
 * @file Unit tests for src/exe/smol/https.ts. On stock Node, `getSmolHttps()`
 *   returns `undefined`. The smol-binary path is exercised by socket-btm's own
 *   tests.
 */

import { getSmolHttps as getSmolHttpsStable } from '@socketsecurity/lib-stable/exe/smol/https'
import { describe, expect, it } from 'vitest'

import { getSmolHttps } from '../../../../src/exe/smol/https.mjs'
import { stableAvailable } from '../../../_shared/lib-stable-parity.mts'

const hasStable = stableAvailable(getSmolHttpsStable)

describe('smol/https', () => {
  describe('getSmolHttps', () => {
    it('returns undefined on stock Node', () => {
      expect(getSmolHttps()).toBe(undefined)
    })

    it.skipIf(!hasStable)('matches the released build', () => {
      expect(getSmolHttps()).toBe(getSmolHttpsStable())
    })

    it('does not throw', () => {
      expect(() => getSmolHttps()).not.toThrow()
    })
  })
})
