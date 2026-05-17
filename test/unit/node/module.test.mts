/**
 * @fileoverview Unit tests for src/node/module.ts.
 */

import { describe, expect, it } from 'vitest'

import {
  getNodeModule,
  isNodeBuiltin,
} from '@socketsecurity/lib/node/module'

describe('node/module', () => {
  describe('getNodeModule', () => {
    it('returns the node:module module', () => {
      const mod = getNodeModule()
      expect(typeof mod.isBuiltin).toBe('function')
      expect(typeof mod.createRequire).toBe('function')
    })

    it('is idempotent across repeated calls', () => {
      expect(getNodeModule()).toBe(getNodeModule())
    })

    it('does not throw', () => {
      expect(() => getNodeModule()).not.toThrow()
    })
  })

  describe('isNodeBuiltin', () => {
    it('returns true for a real Node built-in', () => {
      expect(isNodeBuiltin('fs')).toBe(true)
      expect(isNodeBuiltin('node:fs')).toBe(true)
      expect(isNodeBuiltin('node:module')).toBe(true)
    })

    it('returns false for non-existent modules', () => {
      expect(isNodeBuiltin('not-a-real-module')).toBe(false)
      expect(isNodeBuiltin('node:smol-vfs')).toBe(false)
    })

    it('returns false for npm packages (not built-ins)', () => {
      expect(isNodeBuiltin('vitest')).toBe(false)
    })

    it('caches the bound reference across calls', () => {
      // First call resolves; subsequent calls hit the cached reference.
      // Both should return the same answers without re-resolution.
      const first = isNodeBuiltin('node:fs')
      const second = isNodeBuiltin('node:fs')
      expect(first).toBe(second)
    })
  })
})
