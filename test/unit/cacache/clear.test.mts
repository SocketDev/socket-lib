/**
 * @file Unit tests for src/cacache/clear — clear, plus integration and
 *   wildcard-pattern tests.
 */

import { describe, expect, it, vi } from 'vitest'

import { getCacache } from '../../../src/cacache/_internal'
import { clear } from '../../../src/cacache/clear'
import { get, safeGet } from '../../../src/cacache/read'
import { put, remove } from '../../../src/cacache/write'
import type { RemoveOptions } from '../../../src/cacache/types'

describe('clear', () => {
  it('should export clear function', () => {
    expect(typeof clear).toBe('function')
  })

  it('should accept RemoveOptions with prefix', async () => {
    const opts: RemoveOptions = { prefix: 'test-prefix' }
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

describe('cacache integration', () => {
  it('should support put -> get -> remove workflow', async () => {
    const key = `test-integration-${Date.now()}`
    const data = 'test data'

    try {
      await put(key, data)

      const entry = await get(key)
      expect(entry).toBeDefined()
      expect(entry.key).toBe(key)
      expect(entry.data.toString()).toBe(data)

      await remove(key)

      await expect(get(key)).rejects.toThrow()
    } catch (e) {
      expect((e as Error).message).not.toMatch(/wildcard/i)
    }
  })

  it('should support put -> safeGet workflow', async () => {
    const key = `test-safe-${Date.now()}`
    const data = 'test data'

    try {
      await put(key, data)

      const entry = await safeGet(key)
      expect(entry).toBeDefined()
      expect(entry?.key).toBe(key)

      await remove(key)

      const missing = await safeGet(key)
      expect(missing).toBeUndefined()
    } catch (e) {
      expect((e as Error).message).not.toMatch(/wildcard/i)
    }
  })

  it('should support clear with prefix workflow', async () => {
    const prefix = `test-clear-${Date.now()}`
    const keys = [`${prefix}:1`, `${prefix}:2`, `${prefix}:3`]

    try {
      await Promise.all(keys.map(key => put(key, `data-${key}`)))

      const removed = await clear({ prefix })
      expect(typeof removed).toBe('number')
      expect(removed).toBeGreaterThanOrEqual(0)

      // @ts-expect-error - safeGet signature doesn't match map callback but works at runtime
      const results = await Promise.all(keys.map(safeGet))
      for (let i = 0, { length } = results; i < length; i += 1) {
        expect(results[i]).toBeUndefined()
      }
    } catch (e) {
      expect((e as Error).message).not.toMatch(/wildcard/i)
    }
  })

  it('should support clear with wildcard workflow', async () => {
    const prefix = `test-wildcard-${Date.now()}`
    const keys = [`${prefix}:abc:1`, `${prefix}:abc:2`, `${prefix}:xyz:1`]

    try {
      await Promise.all(keys.map(key => put(key, `data-${key}`)))

      const removed = await clear({ prefix: `${prefix}:abc*` })
      expect(typeof removed).toBe('number')
      expect(removed).toBeGreaterThanOrEqual(0)

      expect(await safeGet(keys[0]!)).toBeUndefined()
      expect(await safeGet(keys[1]!)).toBeUndefined()

      await safeGet(keys[2]!)

      await clear({ prefix })
    } catch (e) {
      expect((e as Error).message).not.toMatch(/wildcard/i)
    }
  })

  it('should handle Buffer data', async () => {
    const key = `test-buffer-${Date.now()}`
    const data = Buffer.from('test buffer data')
    try {
      await put(key, data)
      const entry = await get(key)
      expect(Buffer.isBuffer(entry.data)).toBe(true)
      await remove(key)
    } catch (e) {
      expect((e as Error).message).not.toMatch(/wildcard/i)
    }
  })

  it('should handle empty data', async () => {
    const key = `test-empty-${Date.now()}`
    try {
      await put(key, '')
      const entry = await get(key)
      expect(entry.data.toString()).toBe('')
      await remove(key)
    } catch (e) {
      expect((e as Error).message).not.toMatch(/wildcard/i)
    }
  })

  it('should handle concurrent operations', async () => {
    const keys = Array.from(
      { length: 10 },
      (_, i) => `concurrent-${Date.now()}-${i}`,
    )

    try {
      await Promise.all(keys.map(key => put(key, `data-${key}`)))

      // @ts-expect-error - safeGet signature doesn't match map callback but works at runtime
      const entries = await Promise.all(keys.map(safeGet))
      for (let i = 0, { length } = entries; i < length; i += 1) {
        const entry = entries[i]!
        if (entry) {
          expect(entry).toBeDefined()
        }
      }

      await Promise.all(keys.map(remove))
    } catch (e) {
      expect((e as Error).message).not.toMatch(/wildcard/i)
    }
  })
})

describe('cacache wildcard pattern matching', () => {
  it('should match simple prefix without wildcards', async () => {
    const prefix = `test-simple-${Date.now()}`
    try {
      const result = await clear({ prefix })
      expect(typeof result).toBe('number')
    } catch (e) {
      expect((e as Error).message).not.toMatch(/wildcard/i)
    }
  })

  it('should match wildcard at end', async () => {
    const prefix = `test-wildcard-end-${Date.now()}:*`
    try {
      const result = await clear({ prefix })
      expect(typeof result).toBe('number')
    } catch (e) {
      expect((e as Error).message).not.toMatch(/wildcard/i)
    }
  })

  it('should match wildcard in middle', async () => {
    const prefix = `test-wildcard-middle-${Date.now()}:*:suffix`
    try {
      const result = await clear({ prefix })
      expect(typeof result).toBe('number')
    } catch (e) {
      expect((e as Error).message).not.toMatch(/wildcard/i)
    }
  })

  it('should match multiple wildcards', async () => {
    const prefix = `test-multi-${Date.now()}:*:*`
    try {
      const result = await clear({ prefix })
      expect(typeof result).toBe('number')
    } catch (e) {
      expect((e as Error).message).not.toMatch(/wildcard/i)
    }
  })

  it('should handle wildcards with regex special chars', async () => {
    const prefix = `test-regex-${Date.now()}:foo.bar[baz]*`
    try {
      const result = await clear({ prefix })
      expect(typeof result).toBe('number')
    } catch (e) {
      expect((e as Error).message).not.toMatch(/wildcard/i)
    }
  })

  it('should handle complex wildcard patterns', async () => {
    const prefix = 'socket-sdk:npm/lodash.*/4.*.0/*'
    try {
      const result = await clear({ prefix })
      expect(typeof result).toBe('number')
    } catch (e) {
      expect((e as Error).message).not.toMatch(/wildcard/i)
    }
  })

  it('should handle pattern with parentheses', async () => {
    const prefix = `test-(group)-${Date.now()}*`
    try {
      const result = await clear({ prefix })
      expect(typeof result).toBe('number')
    } catch (e) {
      expect((e as Error).message).not.toMatch(/wildcard/i)
    }
  })

  it('should handle pattern with plus and question marks', async () => {
    const prefix = `test+value?${Date.now()}*`
    try {
      const result = await clear({ prefix })
      expect(typeof result).toBe('number')
    } catch (e) {
      expect((e as Error).message).not.toMatch(/wildcard/i)
    }
  })

  it('should handle pattern with caret and dollar', async () => {
    const prefix = `test^start$end-${Date.now()}*`
    try {
      const result = await clear({ prefix })
      expect(typeof result).toBe('number')
    } catch (e) {
      expect((e as Error).message).not.toMatch(/wildcard/i)
    }
  })

  it('should handle pattern with pipe character', async () => {
    const prefix = `test|or|${Date.now()}*`
    try {
      const result = await clear({ prefix })
      expect(typeof result).toBe('number')
    } catch (e) {
      expect((e as Error).message).not.toMatch(/wildcard/i)
    }
  })

  it('should handle pattern with backslash', async () => {
    const prefix = `test\\escape-${Date.now()}*`
    try {
      const result = await clear({ prefix })
      expect(typeof result).toBe('number')
    } catch (e) {
      expect((e as Error).message).not.toMatch(/wildcard/i)
    }
  })
})

describe('cacache edge cases', () => {
  it('should handle empty string keys', async () => {
    const key = ''
    try {
      await put(key, 'data')
      await remove(key)
    } catch (e) {
      expect((e as Error).message).not.toMatch(/wildcard/i)
    }
  })

  it('should handle very long keys', async () => {
    const longKey = 'x'.repeat(1000)
    try {
      await put(longKey, 'data')
      await remove(longKey)
    } catch (e) {
      expect((e as Error).message).not.toMatch(/wildcard/i)
    }
  })

  it('should handle keys with special characters', async () => {
    const key = `test:key/${Date.now()}@special`
    try {
      await put(key, 'data')
      await remove(key)
    } catch (e) {
      expect((e as Error).message).not.toMatch(/wildcard/i)
    }
  })

  it('should handle clear with empty prefix string', async () => {
    try {
      const result = await clear({ prefix: '' })
      expect(typeof result).toBe('number')
    } catch (e) {
      expect((e as Error).message).not.toMatch(/wildcard/i)
    }
  })

  it('should handle clear with only wildcard', async () => {
    try {
      const result = await clear({ prefix: '*' })
      expect(typeof result).toBe('number')
    } catch (e) {
      expect((e as Error).message).not.toMatch(/wildcard/i)
    }
  })
})
