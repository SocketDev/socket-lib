/**
 * @fileoverview Integration tests for ESM imports from CommonJS modules.
 * Tests that Node.js ESM loader can properly detect named exports from
 * esbuild-compiled CommonJS modules.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'

describe('ESM imports from CommonJS', () => {
  describe('globs module', () => {
    it('should import glob function', async () => {
      const { glob } = await import('@socketsecurity/lib/globs')
      assert.strictEqual(typeof glob, 'function', 'glob should be a function')
    })

    it('should import globSync function', async () => {
      const { globSync } = await import('@socketsecurity/lib/globs')
      assert.strictEqual(
        typeof globSync,
        'function',
        'globSync should be a function',
      )
    })

    it('should import defaultIgnore', async () => {
      const { defaultIgnore } = await import('@socketsecurity/lib/globs')
      assert.ok(Array.isArray(defaultIgnore), 'defaultIgnore should be an array')
    })

    it('should import getGlobMatcher', async () => {
      const { getGlobMatcher } = await import('@socketsecurity/lib/globs')
      assert.strictEqual(
        typeof getGlobMatcher,
        'function',
        'getGlobMatcher should be a function',
      )
    })

    it('should import all exports together', async () => {
      const module = await import('@socketsecurity/lib/globs')
      assert.strictEqual(typeof module.glob, 'function')
      assert.strictEqual(typeof module.globSync, 'function')
      assert.strictEqual(typeof module.getGlobMatcher, 'function')
      assert.ok(Array.isArray(module.defaultIgnore))
    })
  })
})
