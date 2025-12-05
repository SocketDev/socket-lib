/**
 * @fileoverview Integration tests for ESM imports from CommonJS modules.
 * Tests that Node.js ESM loader can properly detect named exports from
 * esbuild-compiled CommonJS modules.
 */

import { describe, expect, it } from 'vitest'

describe('ESM imports from CommonJS', () => {
  describe('globs module', () => {
    it('should import glob function', async () => {
      const { glob } = await import('@socketsecurity/lib/globs')
      expect(typeof glob).toBe('function')
    })

    it('should import globSync function', async () => {
      const { globSync } = await import('@socketsecurity/lib/globs')
      expect(typeof globSync).toBe('function')
    })

    it('should import defaultIgnore', async () => {
      const { defaultIgnore } = await import('@socketsecurity/lib/globs')
      expect(Array.isArray(defaultIgnore)).toBe(true)
    })

    it('should import getGlobMatcher', async () => {
      const { getGlobMatcher } = await import('@socketsecurity/lib/globs')
      expect(typeof getGlobMatcher).toBe('function')
    })

    it('should import all exports together', async () => {
      const module = await import('@socketsecurity/lib/globs')
      expect(typeof module.glob).toBe('function')
      expect(typeof module.globSync).toBe('function')
      expect(typeof module.getGlobMatcher).toBe('function')
      expect(Array.isArray(module.defaultIgnore)).toBe(true)
    })
  })
})
