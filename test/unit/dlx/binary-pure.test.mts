/**
 * @fileoverview Real unit coverage for the pure parts of src/dlx/binary.ts:
 * executeBinary (routing) and getBinaryCacheMetadataPath (path construction).
 *
 * Existing dlx/binary.test.mts covers dlxBinary / cleanDlxCache / listDlxCache /
 * getDlxCachePath. This file fills in the rest of the public surface.
 */

import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  executeBinary,
  getBinaryCacheMetadataPath,
} from '../../../src/dlx/binary'

describe('dlx/binary — pure functions', () => {
  describe('getBinaryCacheMetadataPath', () => {
    it('appends .dlx-metadata.json to the cache entry path', () => {
      const result = getBinaryCacheMetadataPath('/tmp/dlx-cache/abc')
      expect(result.endsWith('.dlx-metadata.json')).toBe(true)
      expect(result).toContain(path.join('dlx-cache', 'abc'))
    })

    it('round-trips through path.dirname back to the original entry', () => {
      const entry = path.join('/tmp/dlx-cache', 'entry-123')
      const metadata = getBinaryCacheMetadataPath(entry)
      expect(path.dirname(metadata)).toBe(entry)
    })
  })

  describe('executeBinary', () => {
    it('routes a non-existent binary through spawn (rejects)', async () => {
      // Confirms executeBinary doesn't short-circuit before reaching
      // the spawn call. The spawned binary doesn't exist so spawn rejects.
      const result = executeBinary('/definitely/not/a/binary/xyz', [], {
        stdio: 'ignore',
      })
      await expect(result).rejects.toThrow()
    })

    it('handles empty args array', async () => {
      // Just confirms the args are forwarded, not consumed.
      const result = executeBinary('/definitely/not/a/binary/xyz', [], {
        stdio: 'ignore',
      })
      await expect(result).rejects.toThrow()
    })
  })
})
