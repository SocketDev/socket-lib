/**
 * @fileoverview Unit tests for path rewiring utilities for testing.
 */

import { afterEach, describe, expect, it } from 'vitest'

import {
  clearPath,
  getPathValue,
  hasOverride,
  invalidateCaches,
  registerCacheInvalidation,
  resetPaths,
  setPath,
} from '@socketsecurity/lib/paths/rewire'

describe('paths/rewire', () => {
  afterEach(() => {
    // Clean up after each test
    resetPaths()
  })

  describe('setPath', () => {
    it('should set a path override', () => {
      setPath('testKey', '/test/path')
      expect(hasOverride('testKey')).toBe(true)
    })

    it('should override path values', () => {
      const originalFn = () => '/original/path'
      setPath('testKey', '/override/path')
      const value = getPathValue('testKey', originalFn)
      expect(value).toBe('/override/path')
    })

    it('should accept undefined value', () => {
      setPath('testKey', undefined)
      expect(hasOverride('testKey')).toBe(true)
    })

    it('should trigger cache invalidation', () => {
      let invalidated = false
      registerCacheInvalidation(() => {
        invalidated = true
      })
      setPath('testKey', '/test')
      expect(invalidated).toBe(true)
    })
  })

  describe('clearPath', () => {
    it('should clear a specific path override', () => {
      setPath('testKey', '/test/path')
      expect(hasOverride('testKey')).toBe(true)
      clearPath('testKey')
      expect(hasOverride('testKey')).toBe(false)
    })

    it('should trigger cache invalidation', () => {
      let invalidationCount = 0
      registerCacheInvalidation(() => {
        invalidationCount++
      })
      setPath('testKey', '/test')
      clearPath('testKey')
      // Should be called twice: once for setPath, once for clearPath
      expect(invalidationCount).toBeGreaterThanOrEqual(2)
    })

    it('should not affect other overrides', () => {
      setPath('key1', '/path1')
      setPath('key2', '/path2')
      clearPath('key1')
      expect(hasOverride('key1')).toBe(false)
      expect(hasOverride('key2')).toBe(true)
    })
  })

  describe('getPathValue', () => {
    it('should return override if set', () => {
      setPath('testKey', '/override')
      const value = getPathValue('testKey', () => '/original')
      expect(value).toBe('/override')
    })

    it('should call original function if no override', () => {
      const value = getPathValue('testKey', () => '/original')
      expect(value).toBe('/original')
    })

    it('should cache computed values', () => {
      let callCount = 0
      const originalFn = () => {
        callCount++
        return '/original'
      }

      getPathValue('testKey', originalFn)
      getPathValue('testKey', originalFn)
      getPathValue('testKey', originalFn)

      // Should only call once, then use cache
      expect(callCount).toBe(1)
    })

    it('should not cache overridden values', () => {
      let callCount = 0
      const originalFn = () => {
        callCount++
        return '/original'
      }

      setPath('testKey', '/override')
      getPathValue('testKey', originalFn)
      getPathValue('testKey', originalFn)

      // Should not call original function when overridden
      expect(callCount).toBe(0)
    })

    it('should invalidate cache when override is set', () => {
      let callCount = 0
      const originalFn = () => {
        callCount++
        return `/original-${callCount}`
      }

      // First call caches
      const val1 = getPathValue('testKey', originalFn)
      expect(val1).toBe('/original-1')

      // Second call uses cache
      const val2 = getPathValue('testKey', originalFn)
      expect(val2).toBe('/original-1')

      // Set override clears cache
      setPath('otherKey', '/other')

      // Next call should compute fresh
      const val3 = getPathValue('testKey', originalFn)
      expect(val3).toBe('/original-2')
    })
  })

  describe('hasOverride', () => {
    it('should return false when no override exists', () => {
      expect(hasOverride('nonexistent')).toBe(false)
    })

    it('should return true when override exists', () => {
      setPath('testKey', '/test')
      expect(hasOverride('testKey')).toBe(true)
    })

    it('should return true for undefined override', () => {
      setPath('testKey', undefined)
      expect(hasOverride('testKey')).toBe(true)
    })

    it('should return false after clearing', () => {
      setPath('testKey', '/test')
      clearPath('testKey')
      expect(hasOverride('testKey')).toBe(false)
    })
  })

  describe('resetPaths', () => {
    it('should clear all overrides', () => {
      setPath('key1', '/path1')
      setPath('key2', '/path2')
      setPath('key3', '/path3')

      resetPaths()

      expect(hasOverride('key1')).toBe(false)
      expect(hasOverride('key2')).toBe(false)
      expect(hasOverride('key3')).toBe(false)
    })

    it('should trigger cache invalidation', () => {
      let invalidated = false
      registerCacheInvalidation(() => {
        invalidated = true
      })
      resetPaths()
      expect(invalidated).toBe(true)
    })

    it('should invalidate value cache', () => {
      let callCount = 0
      const originalFn = () => {
        callCount++
        return `/original-${callCount}`
      }

      // Cache a value
      getPathValue('testKey', originalFn)
      expect(callCount).toBe(1)

      // Reset should clear cache
      resetPaths()

      // Next call should compute fresh
      getPathValue('testKey', originalFn)
      expect(callCount).toBe(2)
    })
  })

  describe('invalidateCaches', () => {
    it('should clear value cache', () => {
      let callCount = 0
      const originalFn = () => {
        callCount++
        return '/original'
      }

      getPathValue('testKey', originalFn)
      expect(callCount).toBe(1)

      invalidateCaches()

      getPathValue('testKey', originalFn)
      expect(callCount).toBe(2)
    })

    it('should call registered callbacks', () => {
      let callback1Called = false
      let callback2Called = false

      registerCacheInvalidation(() => {
        callback1Called = true
      })
      registerCacheInvalidation(() => {
        callback2Called = true
      })

      invalidateCaches()

      expect(callback1Called).toBe(true)
      expect(callback2Called).toBe(true)
    })

    it('should ignore errors in callbacks', () => {
      registerCacheInvalidation(() => {
        throw new Error('Callback error')
      })

      expect(() => invalidateCaches()).not.toThrow()
    })

    it('should call all callbacks even if one throws', () => {
      let callback2Called = false

      registerCacheInvalidation(() => {
        throw new Error('First callback error')
      })
      registerCacheInvalidation(() => {
        callback2Called = true
      })

      invalidateCaches()

      expect(callback2Called).toBe(true)
    })
  })

  describe('registerCacheInvalidation', () => {
    it('should register callback', () => {
      let called = false
      registerCacheInvalidation(() => {
        called = true
      })

      invalidateCaches()

      expect(called).toBe(true)
    })

    it('should register multiple callbacks', () => {
      let count = 0
      registerCacheInvalidation(() => {
        count++
      })
      registerCacheInvalidation(() => {
        count++
      })
      registerCacheInvalidation(() => {
        count++
      })

      invalidateCaches()

      expect(count).toBe(3)
    })

    it('should call callbacks in order', () => {
      const calls: number[] = []
      registerCacheInvalidation(() => {
        calls.push(1)
      })
      registerCacheInvalidation(() => {
        calls.push(2)
      })
      registerCacheInvalidation(() => {
        calls.push(3)
      })

      invalidateCaches()

      expect(calls).toEqual([1, 2, 3])
    })
  })

  describe('integration scenarios', () => {
    it('should support test isolation', () => {
      // First test
      setPath('tmpdir', '/custom/tmp')
      expect(hasOverride('tmpdir')).toBe(true)

      // Clean up
      resetPaths()
      expect(hasOverride('tmpdir')).toBe(false)

      // Second test - should be clean
      expect(hasOverride('tmpdir')).toBe(false)
    })

    it('should support multiple path overrides', () => {
      setPath('tmpdir', '/custom/tmp')
      setPath('homedir', '/custom/home')
      setPath('cwd', '/custom/cwd')

      expect(getPathValue('tmpdir', () => '/tmp')).toBe('/custom/tmp')
      expect(getPathValue('homedir', () => '/home')).toBe('/custom/home')
      expect(getPathValue('cwd', () => '/cwd')).toBe('/custom/cwd')
    })

    it('should support changing overrides', () => {
      setPath('testKey', '/path1')
      expect(getPathValue('testKey', () => '/original')).toBe('/path1')

      setPath('testKey', '/path2')
      expect(getPathValue('testKey', () => '/original')).toBe('/path2')
    })

    it('should handle cache invalidation across multiple paths', () => {
      let tmp1Calls = 0
      let tmp2Calls = 0

      const tmpFn1 = () => {
        tmp1Calls++
        return '/tmp1'
      }
      const tmpFn2 = () => {
        tmp2Calls++
        return '/tmp2'
      }

      // Cache both
      getPathValue('tmp1', tmpFn1)
      getPathValue('tmp2', tmpFn2)
      expect(tmp1Calls).toBe(1)
      expect(tmp2Calls).toBe(1)

      // Invalidate
      setPath('other', '/other')

      // Both should recompute
      getPathValue('tmp1', tmpFn1)
      getPathValue('tmp2', tmpFn2)
      expect(tmp1Calls).toBe(2)
      expect(tmp2Calls).toBe(2)
    })

    it('should work in typical test setup/teardown pattern', () => {
      // Simulate beforeEach
      setPath('tmpdir', '/test/tmp')

      // Test code
      const tmpdir = getPathValue('tmpdir', () => '/default/tmp')
      expect(tmpdir).toBe('/test/tmp')

      // Simulate afterEach
      resetPaths()
      expect(hasOverride('tmpdir')).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('should handle empty string paths', () => {
      setPath('testKey', '')
      expect(getPathValue('testKey', () => '/original')).toBe('')
    })

    it('should handle empty string keys', () => {
      setPath('', '/test')
      expect(hasOverride('')).toBe(true)
    })

    it('should handle special characters in keys', () => {
      setPath('my-key_123', '/test')
      expect(hasOverride('my-key_123')).toBe(true)
    })

    it('should handle very long paths', () => {
      const longPath = '/very/long/path/'.repeat(100)
      setPath('testKey', longPath)
      expect(getPathValue('testKey', () => '/short')).toBe(longPath)
    })

    it('should not leak between different keys', () => {
      setPath('key1', '/path1')
      expect(hasOverride('key2')).toBe(false)
      expect(getPathValue('key2', () => '/original')).toBe('/original')
    })
  })

  describe('performance characteristics', () => {
    it('should cache expensive computations', () => {
      let callCount = 0
      const expensiveFn = () => {
        callCount++
        // Simulate work
        for (let i = 0; i < 1000; i++) {
          Math.random()
        }
        return '/computed'
      }

      // First call - computes
      getPathValue('testKey', expensiveFn)
      expect(callCount).toBe(1)

      // Second call - should use cache (not call function)
      getPathValue('testKey', expensiveFn)
      expect(callCount).toBe(1)

      // Third call - still cached
      getPathValue('testKey', expensiveFn)
      expect(callCount).toBe(1)
    })
  })
})
