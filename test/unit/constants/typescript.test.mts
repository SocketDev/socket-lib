/**
 * @fileoverview Unit tests for TypeScript availability checks.
 *
 * Tests the pair of feature-detection getters:
 * - getTsTypesAvailable() — checks for typescript/lib/lib.d.ts
 * - getTsLibsAvailable() — checks for typescript/lib
 *
 * Each returns a cached boolean based on runtime module resolution.
 */

import { describe, expect, it } from 'vitest'

import {
  getTsLibsAvailable,
  getTsTypesAvailable,
} from '@socketsecurity/lib/constants/typescript'

describe('constants/typescript', () => {
  describe('getTsTypesAvailable', () => {
    it('returns a boolean', () => {
      expect(typeof getTsTypesAvailable()).toBe('boolean')
    })

    it('is cached — consistent across repeated calls', () => {
      const first = getTsTypesAvailable()
      for (let i = 0; i < 10; i++) {
        expect(getTsTypesAvailable()).toBe(first)
      }
    })
  })

  describe('getTsLibsAvailable', () => {
    it('returns a boolean', () => {
      expect(typeof getTsLibsAvailable()).toBe('boolean')
    })

    it('is cached — consistent across repeated calls', () => {
      const first = getTsLibsAvailable()
      for (let i = 0; i < 10; i++) {
        expect(getTsLibsAvailable()).toBe(first)
      }
    })
  })

  describe('independence', () => {
    it('call order does not affect results (each getter memoizes independently)', () => {
      const typesFirst = getTsTypesAvailable()
      const libsAfterTypes = getTsLibsAvailable()
      const libsFirst = getTsLibsAvailable()
      const typesAfterLibs = getTsTypesAvailable()
      expect(typesFirst).toBe(typesAfterLibs)
      expect(libsFirst).toBe(libsAfterTypes)
    })
  })
})
