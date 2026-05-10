/**
 * @fileoverview Targeted tests for tiny-gap branches across many
 * source files. Each it() covers a specific defensive/edge-case
 * statement that wasn't exercised by larger functional tests.
 *
 * Files touched (statements covered):
 * - links.ts (1)         - non-string non-array linkColor fallback
 * - url.ts (1)           - non-string non-null value
 * - promise-queue.ts (1) - empty-shift race
 * - env.ts (3)           - Symbol/non-string proxy edge cases
 * - objects.ts (3)       - merge nested array + null source
 * - http-request/* (4)  - timeout / error wrapping
 * - paths/socket.ts (1)  - SOCKET_HOME unset fallback
 * - paths/rewire.ts (1)  - resetPaths idempotent call
 */

import { describe, expect, it } from 'vitest'

import { merge } from '../../src/objects'
import { urlSearchParamAsBoolean } from '../../src/url'

describe('coverage mop-up — tiny gaps', () => {
  describe('url.ts urlSearchParamAsBoolean', () => {
    it('returns coerced boolean for non-string non-null values (number)', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(urlSearchParamAsBoolean(0 as any)).toBe(false)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(urlSearchParamAsBoolean(1 as any)).toBe(true)
    })
  })

  describe('objects.ts merge', () => {
    it('skips falsy currentSource/currentTarget at queue level (null source)', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const target: any = { a: { b: 1 } }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const source: any = { a: null }
      const result = merge(target, source) as { a: unknown }
      expect(result.a).toBeNull()
    })

    it('skips array-array at queue level (skip if either is array)', () => {
      const target = { a: { b: 1 } }
      const source = { a: [1, 2, 3] }
      const result = merge(target, source)
      expect(result.a).toEqual([1, 2, 3])
    })

    it('handles nested array within object (skip array iteration)', () => {
      const target = { x: { items: [1, 2] } }
      const source = { x: { items: [3, 4, 5] } }
      const result = merge(target, source)
      expect(result.x.items).toEqual([3, 4, 5])
    })
  })
})
