/**
 * @fileoverview Tests for the which / whichSync exports of src/bin.ts.
 *
 * The existing bin.test.mts covers execBin / findReal* / isShadowBinPath /
 * resolveRealBinSync / whichReal / whichRealSync. This file fills in the
 * raw which/whichSync wrappers (which return null on miss, no real-bin
 * resolution).
 */

import { describe, expect, it } from 'vitest'

import { which, whichSync } from '../../../src/bin/which'

describe('bin — which / whichSync', () => {
  describe('which', () => {
    it('returns the path unchanged when binName is an absolute path', async () => {
      const result = await which('/usr/bin/node')
      expect(result).toBe('/usr/bin/node')
    })

    it('returns the path unchanged when binName is a relative path', async () => {
      const result = await which('./local/tool')
      expect(result).toBe('./local/tool')
    })

    it('returns null when the binary is not found in PATH', async () => {
      const result = await which('definitely-not-a-real-binary-xyz-12345')
      expect(result).toBeNull()
    })

    it('returns a string when the binary exists in PATH', async () => {
      // 'node' is required for the test runner — guaranteed in PATH.
      const result = await which('node')
      expect(typeof result).toBe('string')
      expect(result as string).toContain('node')
    })

    it('returns an array when called with all: true', async () => {
      // Even when only one match exists, all: true returns an array.
      const result = await which('node', { all: true })
      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe('whichSync', () => {
    it('returns the path unchanged when binName is an absolute path', () => {
      expect(whichSync('/usr/bin/node')).toBe('/usr/bin/node')
    })

    it('returns the path unchanged when binName is a relative path', () => {
      expect(whichSync('./local/tool')).toBe('./local/tool')
    })

    it('returns null when the binary is not found in PATH', () => {
      expect(whichSync('definitely-not-a-real-binary-xyz-12345')).toBeNull()
    })

    it('returns a string when the binary exists in PATH', () => {
      const result = whichSync('node')
      expect(typeof result).toBe('string')
      expect(result as string).toContain('node')
    })

    it('returns an array when called with all: true', () => {
      const result = whichSync('node', { all: true })
      expect(Array.isArray(result)).toBe(true)
    })
  })
})
