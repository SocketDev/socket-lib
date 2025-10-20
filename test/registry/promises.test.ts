/**
 * @fileoverview Unit tests for promise utilities.
 */

import {
  normalizeIterationOptions,
  normalizeRetryOptions,
  pEach,
  pFilter,
  pRetry,
  resolveRetryOptions,
} from '@socketsecurity/lib/promises'
import { describe, expect, it, vi } from 'vitest'

describe('promises', () => {
  describe('resolveRetryOptions', () => {
    it('should resolve number to retries option', () => {
      const options = resolveRetryOptions(3)
      expect(options.retries).toBe(3)
      expect(options.minTimeout).toBe(200)
      expect(options.maxTimeout).toBe(10_000)
    })

    it('should merge provided options with defaults', () => {
      const options = resolveRetryOptions({ retries: 5, minTimeout: 100 })
      expect(options.retries).toBe(5)
      expect(options.minTimeout).toBe(100)
      expect(options.maxTimeout).toBe(10_000)
    })

    it('should return defaults when no options provided', () => {
      const options = resolveRetryOptions()
      expect(options.retries).toBe(0)
      expect(options.minTimeout).toBe(200)
      expect(options.maxTimeout).toBe(10_000)
    })
  })

  describe('normalizeRetryOptions', () => {
    it('should normalize retry options with defaults', () => {
      const options = normalizeRetryOptions(3)
      expect(options.retries).toBe(3)
      expect(options.backoffFactor).toBe(2)
      expect(options.baseDelayMs).toBe(200)
      expect(options.maxDelayMs).toBe(10_000)
      expect(options.jitter).toBe(true)
    })

    it('should use custom backoff factor', () => {
      const options = normalizeRetryOptions({ retries: 3, backoffFactor: 3 })
      expect(options.backoffFactor).toBe(3)
    })

    it('should use factor as backoffFactor fallback', () => {
      const options = normalizeRetryOptions({ retries: 3, factor: 1.5 })
      expect(options.backoffFactor).toBe(1.5)
    })

    it('should include all retry options', () => {
      const onRetry = vi.fn()
      const options = normalizeRetryOptions({
        onRetry,
        onRetryCancelOnFalse: true,
        onRetryRethrow: true,
        retries: 3,
      })
      expect(options.onRetry).toBe(onRetry)
      expect(options.onRetryCancelOnFalse).toBe(true)
      expect(options.onRetryRethrow).toBe(true)
    })
  })

  describe('normalizeIterationOptions', () => {
    it('should normalize number as concurrency', () => {
      const options = normalizeIterationOptions(5)
      expect(options.concurrency).toBe(5)
    })

    it('should normalize object options', () => {
      const options = normalizeIterationOptions({ concurrency: 3, retries: 2 })
      expect(options.concurrency).toBe(3)
      expect(options.retries.retries).toBe(2)
    })

    it('should default concurrency to 1', () => {
      const options = normalizeIterationOptions()
      expect(options.concurrency).toBe(1)
    })

    it('should ensure minimum concurrency of 1', () => {
      const options = normalizeIterationOptions({ concurrency: 0 })
      expect(options.concurrency).toBe(1)
    })
  })

  describe('pRetry', () => {
    it('should return result on success', async () => {
      const fn = vi.fn().mockResolvedValue('success')
      const result = await pRetry(fn)
      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should retry on failure', async () => {
      let attempts = 0
      const fn = vi.fn().mockImplementation(async () => {
        attempts += 1
        if (attempts < 3) {
          throw new Error('fail')
        }
        return 'success'
      })

      const result = await pRetry(fn, { retries: 3, baseDelayMs: 10 })
      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(3)
    })

    it('should throw error after all retries exhausted', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'))
      await expect(pRetry(fn, { retries: 2, baseDelayMs: 10 })).rejects.toThrow(
        'fail',
      )
      expect(fn).toHaveBeenCalledTimes(3) // Initial + 2 retries
    })

    it('should respect abort signal', async () => {
      const controller = new AbortController()
      const fn = vi.fn().mockImplementation(async () => {
        controller.abort()
        throw new Error('fail')
      })

      const result = await pRetry(fn, {
        retries: 3,
        signal: controller.signal,
      })
      expect(result).toBeUndefined()
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should call onRetry callback', async () => {
      let attempts = 0
      const fn = vi.fn().mockImplementation(async () => {
        attempts += 1
        if (attempts < 2) {
          throw new Error('fail')
        }
        return 'success'
      })
      const onRetry = vi.fn()

      await pRetry(fn, { retries: 2, baseDelayMs: 10, onRetry })
      expect(onRetry).toHaveBeenCalledTimes(1)
      expect(onRetry).toHaveBeenCalledWith(
        1,
        expect.any(Error),
        expect.any(Number),
      )
    })

    it('should cancel retry if onRetry returns false', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'))
      const onRetry = vi.fn().mockReturnValue(false)

      await expect(
        pRetry(fn, {
          onRetry,
          onRetryCancelOnFalse: true,
          retries: 3,
        }),
      ).rejects.toThrow('fail')
      expect(fn).toHaveBeenCalledTimes(1)
      expect(onRetry).toHaveBeenCalledTimes(1)
    })

    it('should not retry if retries is 0', async () => {
      const fn = vi.fn().mockResolvedValue('success')
      const result = await pRetry(fn, { retries: 0 })
      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(1)
    })
  })

  describe('pEach', () => {
    it('should process all items', async () => {
      const items = [1, 2, 3, 4]
      const results: number[] = []
      await pEach(items, async item => {
        results.push(item)
      })
      expect(results).toEqual([1, 2, 3, 4])
    })

    it('should respect concurrency limit', async () => {
      const items = [1, 2, 3, 4, 5, 6]
      const active: number[] = []
      const maxActive: number[] = []

      await pEach(
        items,
        async item => {
          active.push(item)
          maxActive.push(active.length)
          await new Promise(resolve => setTimeout(resolve, 10))
          active.splice(active.indexOf(item), 1)
        },
        { concurrency: 2 },
      )

      expect(Math.max(...maxActive)).toBeLessThanOrEqual(2)
    })

    it('should handle empty arrays', async () => {
      const fn = vi.fn()
      await pEach([], fn)
      expect(fn).not.toHaveBeenCalled()
    })

    it('should respect abort signal', async () => {
      const controller = new AbortController()
      const items = [1, 2, 3, 4]
      const processed: number[] = []

      setTimeout(() => controller.abort(), 20)

      await pEach(
        items,
        async item => {
          await new Promise(resolve => setTimeout(resolve, 15))
          processed.push(item)
        },
        { signal: controller.signal, concurrency: 1 },
      )

      expect(processed.length).toBeLessThan(items.length)
    })
  })

  describe('pFilter', () => {
    it('should filter items based on predicate', async () => {
      const items = [1, 2, 3, 4, 5, 6]
      const result = await pFilter(items, async item => item % 2 === 0)
      expect(result).toEqual([2, 4, 6])
    })

    it('should handle empty arrays', async () => {
      const result = await pFilter([], async () => true)
      expect(result).toEqual([])
    })

    it('should respect concurrency limit', async () => {
      const items = [1, 2, 3, 4, 5, 6]
      let maxActive = 0
      let active = 0

      const result = await pFilter(
        items,
        async item => {
          active += 1
          maxActive = Math.max(maxActive, active)
          await new Promise(resolve => setTimeout(resolve, 10))
          active -= 1
          return item % 2 === 0
        },
        { concurrency: 2 },
      )

      expect(result).toEqual([2, 4, 6])
      expect(maxActive).toBeLessThanOrEqual(2)
    })

    it('should return empty array when no items match', async () => {
      const items = [1, 3, 5, 7]
      const result = await pFilter(items, async item => item % 2 === 0)
      expect(result).toEqual([])
    })

    it('should return all items when all match', async () => {
      const items = [2, 4, 6, 8]
      const result = await pFilter(items, async item => item % 2 === 0)
      expect(result).toEqual([2, 4, 6, 8])
    })
  })
})
