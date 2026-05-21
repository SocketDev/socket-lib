/**
 * @file Integration tests for ESM imports from CommonJS modules. Tests that
 *   Node.js ESM loader can properly detect named exports from esbuild-compiled
 *   CommonJS modules. After commit b7a7d4bf, `src/globs.ts` was split into
 *   per-leaf files (`globs/glob`, `globs/defaults`, `globs/matcher`, etc.) and
 *   the `./globs` barrel export was removed. These tests target the leaf
 *   subpaths directly.
 */

// oxlint-disable socket/no-dynamic-import-outside-bundle -- dynamic import is the behavior under test.

import { describe, expect, it } from 'vitest'

describe('ESM imports from CommonJS', () => {
  describe('globs module', () => {
    it('should import glob function', async () => {
      const { glob } = await import('@socketsecurity/lib/globs/match')
      expect(typeof glob).toBe('function')
    })

    it('should import globSync function', async () => {
      const { globSync } = await import('@socketsecurity/lib/globs/match')
      expect(typeof globSync).toBe('function')
    })

    it('should import defaultIgnore', async () => {
      const { defaultIgnore } =
        await import('@socketsecurity/lib/globs/defaults')
      expect(Array.isArray(defaultIgnore)).toBe(true)
    })

    it('should import getGlobMatcher', async () => {
      const { getGlobMatcher } =
        await import('@socketsecurity/lib/globs/matcher')
      expect(typeof getGlobMatcher).toBe('function')
    })

    it('should import all leaves together', async () => {
      const [globMod, defaultsMod, matcherMod] = await Promise.all([
        import('@socketsecurity/lib/globs/match'),
        import('@socketsecurity/lib/globs/defaults'),
        import('@socketsecurity/lib/globs/matcher'),
      ])
      expect(typeof globMod.glob).toBe('function')
      expect(typeof globMod.globSync).toBe('function')
      expect(typeof matcherMod.getGlobMatcher).toBe('function')
      expect(Array.isArray(defaultsMod.defaultIgnore)).toBe(true)
    })
  })
})
