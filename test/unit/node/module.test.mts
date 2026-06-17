/**
 * @file Unit tests for src/node/module.ts.
 */

import { describe, expect, it } from 'vitest'

import {
  getNodeModule,
  isNodeBuiltin,
  requireBuiltin,
} from '../../../src/node/module'

describe('node/module', () => {
  describe('getNodeModule', () => {
    it('returns the node:module module in Node.js', () => {
      const mod = getNodeModule()
      // In Node.js (where this test runs) `require` exists so mod is defined.
      expect(mod).toBeDefined()
      expect(typeof mod!.isBuiltin).toBe('function')
      expect(typeof mod!.createRequire).toBe('function')
    })

    it('is idempotent across repeated calls', () => {
      const first = getNodeModule()
      const second = getNodeModule()
      expect(first).toBe(second)
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

  describe('requireBuiltin', () => {
    it('loads a present Node built-in by specifier', () => {
      const nodePath = requireBuiltin('node:path') as typeof import('node:path')
      expect(typeof nodePath.join).toBe('function')
    })

    it('resolves the specifier dynamically', () => {
      const os = requireBuiltin('node:os') as typeof import('node:os')
      expect(typeof os.platform).toBe('function')
    })

    it('returns the cached module instance across calls', () => {
      expect(requireBuiltin('node:path')).toBe(requireBuiltin('node:path'))
    })

    it('throws for an absent builtin (callers gate with isNodeBuiltin)', () => {
      // The smol loaders only call this after isNodeBuiltin() confirms the
      // binding exists. On stock Node the binding is absent and require throws,
      // which is why every call site is guarded.
      expect(() => requireBuiltin('node:smol-vfs')).toThrow()
    })
  })
})
