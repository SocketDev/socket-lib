/**
 * @file Unit tests for src/smol/purl.ts. On stock Node, `getSmolPurl()` returns
 *   `undefined`. The integration story is verified by socket-btm's own tests
 *   running inside the smol binary.
 */

import { describe, expect, it } from 'vitest'

// oxlint-disable-next-line socket/no-src-import-in-test-expect -- getSmolPurl is the system-under-test; the assertions exercise its return value and idempotent identity, not a builder of expected values.
import { getSmolPurl } from '../../../src/smol/purl'

describe('smol/purl', () => {
  describe('getSmolPurl', () => {
    it('returns undefined on stock Node', () => {
      expect(getSmolPurl()).toBe(undefined)
    })

    it('is idempotent across repeated calls', () => {
      expect(getSmolPurl()).toBe(getSmolPurl())
    })

    it('does not throw', () => {
      expect(() => getSmolPurl()).not.toThrow()
    })
  })
})
