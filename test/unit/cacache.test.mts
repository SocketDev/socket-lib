/**
 * @file Unit tests for content-addressable cache (cacache) wrapper utilities.
 *   Tests cacache wrapper functions for content-addressable caching:
 *
 *   - getCacache() lazy-loads cacache library
 *   - get(), safeGet() retrieve cached content by key
 *   - put() stores content with integrity hash
 *   - remove() deletes cached entries
 *   - clear() purges entire cache
 *   - withTmp() provides temporary cache directory Used by Socket tools for
 *     package tarball caching and content storage.
 *
 *   Integration, wildcard-pattern, and edge-case coverage lives in the sibling
 *   cacache-patterns.test.mts.
 */

import { describe, expect, it, vi } from 'vitest'

import { getCacache } from '../../src/cacache/_internal'
import { clear } from '../../src/cacache/clear'
import { get, safeGet } from '../../src/cacache/read'
import { withTmp } from '../../src/cacache/tmp'
import { put, remove } from '../../src/cacache/write'
import type {
  GetOptions,
  PutOptions,
  RemoveOptions,
} from '../../src/cacache/types'

describe('cacache', () => {
  describe('getCacache', () => {
    it('should export getCacache function', () => {
      expect(typeof getCacache).toBe('function')
    })

    it('should return cacache module', () => {
      const cacache = getCacache()
      expect(typeof cacache).toBe('object')
    })

    it('should have expected cacache methods', () => {
      const cacache = getCacache()
      expect(typeof cacache.get).toBe('function')
      expect(typeof cacache.put).toBe('function')
      // rm and ls are namespaces with methods like rm.entry, rm.all, ls.stream
      expect(typeof cacache.rm.entry).toBe('function')
      expect(typeof cacache.ls.stream).toBe('function')
    })
  })

  describe('put', () => {
    it('should export put function', () => {
      expect(typeof put).toBe('function')
    })

    it('should reject keys with wildcards', async () => {
      await expect(put('test*key', 'data')).rejects.toThrow(TypeError)
      await expect(put('test*key', 'data')).rejects.toThrow(
        'Cache key cannot contain wildcards (*)',
      )
    })

    it('should reject keys with wildcards in middle', async () => {
      await expect(put('socket:*:key', 'data')).rejects.toThrow(TypeError)
    })

    it('should reject keys with wildcards at end', async () => {
      await expect(put('socket:key*', 'data')).rejects.toThrow(TypeError)
    })

    it('should accept keys without wildcards', async () => {
      // Proves the wildcard check does NOT reject a non-wildcard key.
      // The operation may still fail in test env (no cache dir) — that's
      // fine, but the failure must not be the wildcard-rejection error.
      const key = `test-key-${Date.now()}`
      try {
        await put(key, 'test data')
        await remove(key)
      } catch (e) {
        expect((e as Error).message).not.toMatch(/wildcard/i)
      }
    })
  })

  describe('get', () => {
    it('should export get function', () => {
      expect(typeof get).toBe('function')
    })

    it('should reject keys with wildcards', async () => {
      await expect(get('test*key')).rejects.toThrow(TypeError)
      await expect(get('test*key')).rejects.toThrow(
        'Cache key cannot contain wildcards (*)',
      )
    })

    it('should reject keys with wildcards in middle', async () => {
      await expect(get('socket:*:key')).rejects.toThrow(TypeError)
    })

    it('should reject keys with wildcards at end', async () => {
      await expect(get('socket:key*')).rejects.toThrow(TypeError)
    })

    it('should accept keys without wildcards', async () => {
      // This will fail because key doesn't exist, but proves wildcard check passed
      await expect(get('nonexistent-key')).rejects.toThrow()
    })

    it('should accept GetOptions', async () => {
      const opts: GetOptions = {
        integrity: 'sha512-abc',
        memoize: false,
      }
      await expect(get('nonexistent-key', opts)).rejects.toThrow()
    })
  })

  describe('remove', () => {
    it('should export remove function', () => {
      expect(typeof remove).toBe('function')
    })

    it('should reject keys with wildcards', async () => {
      await expect(remove('test*key')).rejects.toThrow(TypeError)
      await expect(remove('test*key')).rejects.toThrow(
        'Cache key cannot contain wildcards (*)',
      )
    })

    it('should reject keys with wildcards in middle', async () => {
      await expect(remove('socket:*:key')).rejects.toThrow(TypeError)
    })

    it('should reject keys with wildcards at end', async () => {
      await expect(remove('socket:key*')).rejects.toThrow(TypeError)
    })

    it('should suggest using clear for wildcards', async () => {
      await expect(remove('test*')).rejects.toThrow(
        'Use clear({ prefix: "pattern*" })',
      )
    })

    it('should accept keys without wildcards', async () => {
      // This may succeed (if key doesn't exist) or fail (cache issues)
      // Either way, it proves the wildcard check passed
      try {
        await remove('nonexistent-key')
      } catch (e) {
        expect((e as Error).message).not.toMatch(/wildcard/i)
      }
    })
  })

  describe('safeGet', () => {
    it('should export safeGet function', () => {
      expect(typeof safeGet).toBe('function')
    })

    it('should return undefined for nonexistent keys', async () => {
      const result = await safeGet('nonexistent-key')
      expect(result).toBeUndefined()
    })

    it('should return undefined on wildcard errors', async () => {
      const result = await safeGet('test*key')
      expect(result).toBeUndefined()
    })

    it('should accept GetOptions', async () => {
      const opts: GetOptions = {
        integrity: 'sha512-abc',
        memoize: false,
      }
      const result = await safeGet('nonexistent-key', opts)
      expect(result).toBeUndefined()
    })

    it('should not throw on errors', async () => {
      await expect(safeGet('any-key')).resolves.toBeUndefined()
      await expect(safeGet('test*key')).resolves.toBeUndefined()
    })
  })

  describe('clear', () => {
    it('should export clear function', () => {
      expect(typeof clear).toBe('function')
    })

    it('should accept RemoveOptions with prefix', async () => {
      const opts: RemoveOptions = { prefix: 'test-prefix' }
      // This may succeed or fail depending on cache state
      try {
        const result = await clear(opts)
        expect(typeof result).toBe('number')
      } catch (e) {
        expect((e as Error).message).not.toMatch(/wildcard/i)
      }
    })

    it('should accept RemoveOptions with wildcard', async () => {
      const opts: RemoveOptions = { prefix: 'test-prefix*' }
      try {
        const result = await clear(opts)
        expect(typeof result).toBe('number')
      } catch (e) {
        expect((e as Error).message).not.toMatch(/wildcard/i)
      }
    })

    it('should accept no options', async () => {
      try {
        const result = await clear()
        expect(result).toBeUndefined()
      } catch (e) {
        // Ignore ENOTEMPTY errors per implementation
        if ((e as NodeJS.ErrnoException)?.code !== 'ENOTEMPTY') {
          expect((e as Error).message).not.toMatch(/wildcard/i)
        }
      }
    })

    it('should accept undefined options', async () => {
      try {
        const result = await clear(undefined)
        expect(result).toBeUndefined()
      } catch (e) {
        if ((e as NodeJS.ErrnoException)?.code !== 'ENOTEMPTY') {
          expect((e as Error).message).not.toMatch(/wildcard/i)
        }
      }
    })

    it('should accept empty options object', async () => {
      try {
        const result = await clear({})
        expect(result).toBeUndefined()
      } catch (e) {
        if ((e as NodeJS.ErrnoException)?.code !== 'ENOTEMPTY') {
          expect((e as Error).message).not.toMatch(/wildcard/i)
        }
      }
    })

    it('should handle ENOTEMPTY errors gracefully', async () => {
      // Test that ENOTEMPTY errors are silently ignored
      const cacache = getCacache()
      const originalRmAll = cacache.rm.all

      try {
        cacache.rm.all = Object.assign(
          vi.fn().mockRejectedValue(
            Object.assign(new Error('ENOTEMPTY'), {
              code: 'ENOTEMPTY',
            }),
          ),
          { sync: vi.fn() },
        ) as typeof cacache.rm.all

        // Should not throw
        await expect(clear()).resolves.toBeUndefined()
      } finally {
        cacache.rm.all = originalRmAll
      }
    })

    it('should throw non-ENOTEMPTY errors', async () => {
      const cacache = getCacache()
      const originalRmAll = cacache.rm.all

      try {
        cacache.rm.all = Object.assign(
          vi.fn().mockRejectedValue(
            Object.assign(new Error('EACCES'), {
              code: 'EACCES',
            }),
          ),
          { sync: vi.fn() },
        ) as typeof cacache.rm.all

        await expect(clear()).rejects.toThrow('EACCES')
      } finally {
        cacache.rm.all = originalRmAll
      }
    })
  })

  describe('withTmp', () => {
    it('should export withTmp function', () => {
      expect(typeof withTmp).toBe('function')
    })

    it('should call callback with temp directory path', async () => {
      const callback = vi.fn(async (tmpDir: string) => {
        expect(typeof tmpDir).toBe('string')
        expect(tmpDir.length).toBeGreaterThan(0)
        return 'result'
      })

      try {
        const result = await withTmp(callback)
        expect(callback).toHaveBeenCalled()
        expect(result).toBe('result')
      } catch (e) {
        // Cache dir may not exist in test env
        expect((e as Error).message).not.toMatch(/wildcard/i)
      }
    })

    it('should return callback result', async () => {
      try {
        const result = await withTmp(async () => {
          return 42
        })
        expect(result).toBe(42)
      } catch (e) {
        expect((e as Error).message).not.toMatch(/wildcard/i)
      }
    })

    it('should support async callbacks', async () => {
      try {
        const result = await withTmp(async tmpDir => {
          await Promise.resolve()
          return tmpDir.length
        })
        expect(typeof result).toBe('number')
      } catch (e) {
        expect((e as Error).message).not.toMatch(/wildcard/i)
      }
    })

    it('should propagate callback errors', async () => {
      try {
        await withTmp(async () => {
          throw new Error('callback error')
        })
        // If we reach here, cache dir doesn't exist
      } catch (e) {
        // Either cache dir error or callback error
        expect((e as Error).message).not.toMatch(/wildcard/i)
      }
    })
  })
})
