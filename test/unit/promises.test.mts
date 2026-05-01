/**
 * @fileoverview Unit tests for async iteration and retry utilities.
 *
 * Tests promise-based iteration and retry helpers:
 * - pEach(), pEachChunk() iterate async operations with concurrency control
 * - pFilter(), pFilterChunk() filter arrays with async predicates
 * - pRetry() retries failed async operations with exponential backoff
 * - normalizeIterationOptions(), normalizeRetryOptions() option normalizers
 * - resolveRetryOptions() retry configuration resolver
 * Used by Socket tools for batch operations and fault-tolerant API calls.
 */

import {
  fromAsync,
  normalizeIterationOptions,
  normalizeRetryOptions,
  pEach,
  pEachChunk,
  pFilter,
  pFilterChunk,
  pRetry,
  resolveRetryOptions,
  withResolvers,
} from '@socketsecurity/lib/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('promises', () => {
  describe('resolveRetryOptions', () => {
    it('should resolve number to retries option', () => {
      const options = resolveRetryOptions(3)
      expect(options.retries).toBe(3)
      expect(options.baseDelayMs).toBe(200)
      expect(options.maxDelayMs).toBe(10_000)
    })

    it('should merge provided options with defaults', () => {
      const options = resolveRetryOptions({ retries: 5, baseDelayMs: 100 })
      expect(options.retries).toBe(5)
      expect(options.baseDelayMs).toBe(100)
      expect(options.maxDelayMs).toBe(10_000)
    })

    it('should return defaults when no options provided', () => {
      const options = resolveRetryOptions()
      expect(options.retries).toBe(0)
      expect(options.baseDelayMs).toBe(200)
      expect(options.maxDelayMs).toBe(10_000)
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
      // Abort synchronously after the first item is processed so the
      // outcome doesn't depend on wall-clock ordering of setTimeout vs
      // the async iterator.
      const controller = new AbortController()
      const items = [1, 2, 3, 4]
      const processed: number[] = []

      await pEach(
        items,
        async item => {
          processed.push(item)
          // Trigger abort after first item; subsequent iterations see
          // an already-aborted signal.
          if (item === 1) {
            controller.abort()
          }
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

    it('should retry failed filter operations', async () => {
      const items = [1, 2, 3, 4]
      let attempts = 0
      const result = await pFilter(
        items,
        async item => {
          attempts += 1
          if (attempts <= 2 && item === 2) {
            throw new Error('Temporary failure')
          }
          return item % 2 === 0
        },
        { concurrency: 1, retries: 3 },
      )
      expect(result).toEqual([2, 4])
      expect(attempts).toBeGreaterThan(4) // Should have retried for item 2
    })

    it('should respect abort signal', async () => {
      // Abort synchronously after the first item so the outcome doesn't
      // depend on wall-clock timer races.
      const controller = new AbortController()
      const items = [1, 2, 3, 4, 5, 6]

      const result = await pFilter(
        items,
        async item => {
          if (item === 1) {
            controller.abort()
          }
          return item % 2 === 0
        },
        { signal: controller.signal, concurrency: 1 },
      )

      // When aborted, remaining items should be filtered out
      expect(result.length).toBeLessThan(3)
    })

    it('should use number as concurrency shorthand', async () => {
      const items = [1, 2, 3, 4, 5, 6]
      const result = await pFilter(items, async item => item % 2 === 0, 2)
      expect(result).toEqual([2, 4, 6])
    })
  })

  describe('pFilterChunk', () => {
    it('should filter items in chunks', async () => {
      const chunks = [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
      ]
      const result = await pFilterChunk(chunks, async item => item % 2 === 0)
      expect(result).toEqual([[2], [4, 6], [8]])
    })

    it('should handle empty chunks', async () => {
      const chunks: number[][] = [[], [], []]
      const result = await pFilterChunk(chunks, async item => item % 2 === 0)
      expect(result).toEqual([[], [], []])
    })

    it('should retry failed predicates', async () => {
      const chunks = [[1, 2, 3]]
      let attempts = 0
      const result = await pFilterChunk(
        chunks,
        async item => {
          attempts += 1
          if (attempts <= 2 && item === 2) {
            throw new Error('Temporary failure')
          }
          return item % 2 === 0
        },
        { retries: 3, baseDelayMs: 10 },
      )
      expect(result).toEqual([[2]])
      expect(attempts).toBeGreaterThan(3)
    })

    it('should respect abort signal', async () => {
      const controller = new AbortController()
      const chunks = [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
      ]

      controller.abort()

      const result = await pFilterChunk(chunks, async item => item % 2 === 0, {
        signal: controller.signal,
      })

      // When aborted, chunks should be empty arrays
      expect(result).toEqual([[], [], []])
    })

    it('should handle abort signal mid-processing', async () => {
      // Abort synchronously after first item instead of racing a timer.
      const controller = new AbortController()
      const chunks = [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
      ]

      const result = await pFilterChunk(
        chunks,
        async item => {
          if (item === 1) {
            controller.abort()
          }
          return item % 2 === 0
        },
        { signal: controller.signal },
      )

      // First chunk may complete, rest should be empty
      expect(result.length).toBe(3)
      const totalFiltered = result.flat().length
      expect(totalFiltered).toBeLessThan(4)
    })

    it('should accept retry count as number', async () => {
      const chunks = [[1, 2, 3]]
      let attempts = 0
      const result = await pFilterChunk(
        chunks,
        async item => {
          attempts += 1
          if (attempts <= 2 && item === 2) {
            throw new Error('Temporary failure')
          }
          return item % 2 === 0
        },
        3,
      )
      expect(result).toEqual([[2]])
    })
  })

  describe('pEachChunk', () => {
    it('should process array in chunks', async () => {
      const items = Array.from({ length: 250 }, (_, i) => i + 1)
      const processedChunks: number[][] = []

      await pEachChunk(
        items,
        async chunk => {
          processedChunks.push([...chunk])
        },
        { chunkSize: 100 },
      )

      expect(processedChunks.length).toBe(3)
      expect(processedChunks[0]?.length).toBe(100)
      expect(processedChunks[1]?.length).toBe(100)
      expect(processedChunks[2]?.length).toBe(50)
    })

    it('should use default chunk size of 100', async () => {
      const items = Array.from({ length: 150 }, (_, i) => i + 1)
      const processedChunks: number[][] = []

      await pEachChunk(items, async chunk => {
        processedChunks.push([...chunk])
      })

      expect(processedChunks.length).toBe(2)
      expect(processedChunks[0]?.length).toBe(100)
      expect(processedChunks[1]?.length).toBe(50)
    })

    it('should handle empty arrays', async () => {
      const fn = vi.fn()
      await pEachChunk([], fn, { chunkSize: 10 })
      expect(fn).not.toHaveBeenCalled()
    })

    it('should retry failed chunk operations', async () => {
      const items = [1, 2, 3, 4, 5]
      let attempts = 0

      await pEachChunk(
        items,
        async chunk => {
          attempts += 1
          if (attempts === 1) {
            throw new Error('First attempt fails')
          }
          return chunk
        },
        { chunkSize: 5, retries: 2, baseDelayMs: 10 },
      )

      expect(attempts).toBe(2)
    })

    it('should respect abort signal', async () => {
      // Abort synchronously from inside the first chunk rather than
      // racing a setTimeout with an inner sleep.
      const controller = new AbortController()
      const items = Array.from({ length: 500 }, (_, i) => i + 1)
      let chunksProcessed = 0

      await pEachChunk(
        items,
        async chunk => {
          chunksProcessed += 1
          if (chunksProcessed === 1) {
            controller.abort()
          }
          return chunk
        },
        { chunkSize: 100, signal: controller.signal },
      )

      expect(chunksProcessed).toBeLessThan(5)
    })

    it('should handle abort signal before processing', async () => {
      const controller = new AbortController()
      controller.abort()

      const items = [1, 2, 3, 4, 5]
      const fn = vi.fn()

      await pEachChunk(items, fn, {
        chunkSize: 2,
        signal: controller.signal,
      })

      expect(fn).not.toHaveBeenCalled()
    })

    it('should pass retry options correctly', async () => {
      const items = [1, 2, 3]
      let attempts = 0
      const onRetry = vi.fn()

      await pEachChunk(
        items,
        async () => {
          attempts += 1
          if (attempts === 1) {
            throw new Error('First attempt fails')
          }
        },
        {
          chunkSize: 3,
          retries: 2,
          baseDelayMs: 10,
          onRetry,
        },
      )

      expect(attempts).toBe(2)
      expect(onRetry).toHaveBeenCalledTimes(1)
    })
  })

  describe('pRetry - Advanced Edge Cases', () => {
    it('should apply exponential backoff', async () => {
      let attempts = 0
      const delays: number[] = []

      const fn = vi.fn().mockImplementation(async () => {
        attempts += 1
        if (attempts < 4) {
          throw new Error('fail')
        }
        return 'success'
      })

      await pRetry(fn, {
        retries: 3,
        baseDelayMs: 50,
        backoffFactor: 2,
        jitter: false,
        onRetry: (_attempt, _error, delay) => {
          delays.push(delay)
          return undefined
        },
      })

      expect(delays[0]).toBe(50)
      expect(delays[1]).toBe(100)
      expect(delays[2]).toBe(200)
    })

    it('should apply jitter to delays', async () => {
      let attempts = 0
      const delays: number[] = []

      const fn = vi.fn().mockImplementation(async () => {
        attempts += 1
        if (attempts < 3) {
          throw new Error('fail')
        }
        return 'success'
      })

      await pRetry(fn, {
        retries: 2,
        baseDelayMs: 100,
        backoffFactor: 2,
        jitter: true,
        onRetry: (_attempt, _error, delay) => {
          delays.push(delay)
          return undefined
        },
      })

      // With jitter, delays should be >= base delay but <= 2 * base delay
      expect(delays[0]).toBeGreaterThanOrEqual(100)
      expect(delays[0]).toBeLessThanOrEqual(200)
      expect(delays[1]).toBeGreaterThanOrEqual(200)
      expect(delays[1]).toBeLessThanOrEqual(400)
    })

    it('should respect maxDelayMs cap', async () => {
      let attempts = 0
      const delays: number[] = []

      const fn = vi.fn().mockImplementation(async () => {
        attempts += 1
        if (attempts < 6) {
          throw new Error('fail')
        }
        return 'success'
      })

      await pRetry(fn, {
        retries: 5,
        baseDelayMs: 100,
        backoffFactor: 2,
        maxDelayMs: 300,
        jitter: false,
        onRetry: (_attempt, _error, delay) => {
          delays.push(delay)
          return undefined
        },
      })

      // Delays should be capped at maxDelayMs
      expect(delays[0]).toBe(100)
      expect(delays[1]).toBe(200)
      expect(delays[2]).toBe(300) // Would be 400 but capped
      expect(delays[3]).toBe(300) // Would be 800 but capped
      expect(delays[4]).toBe(300) // Would be 1600 but capped
    })

    it('should allow onRetry to override delay', async () => {
      let attempts = 0
      const actualDelays: number[] = []

      const fn = vi.fn().mockImplementation(async () => {
        attempts += 1
        if (attempts < 3) {
          throw new Error('fail')
        }
        return 'success'
      })

      await pRetry(fn, {
        retries: 2,
        baseDelayMs: 100,
        onRetry: (_attempt, _error, delay) => {
          actualDelays.push(delay)
          return 25 // Override to 25ms
        },
      })

      // Verify custom delays were used
      expect(fn).toHaveBeenCalledTimes(3)
      expect(actualDelays.length).toBe(2)
    })

    it('should ignore negative custom delays from onRetry', async () => {
      let attempts = 0

      const fn = vi.fn().mockImplementation(async () => {
        attempts += 1
        if (attempts < 2) {
          throw new Error('fail')
        }
        return 'success'
      })

      await pRetry(fn, {
        retries: 1,
        baseDelayMs: 50,
        onRetry: () => -100, // Negative value should be ignored
      })

      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('should handle onRetry throwing error with onRetryRethrow true', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('original error'))
      const onRetry = vi.fn().mockImplementation(() => {
        throw new Error('onRetry error')
      })

      await expect(
        pRetry(fn, {
          retries: 2,
          onRetry,
          onRetryRethrow: true,
        }),
      ).rejects.toThrow('onRetry error')

      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should ignore onRetry errors when onRetryRethrow is false', async () => {
      let attempts = 0
      const fn = vi.fn().mockImplementation(async () => {
        attempts += 1
        if (attempts < 2) {
          throw new Error('fail')
        }
        return 'success'
      })
      const onRetry = vi.fn().mockImplementation(() => {
        throw new Error('onRetry error')
      })

      const result = await pRetry(fn, {
        retries: 2,
        baseDelayMs: 10,
        onRetry,
        onRetryRethrow: false,
      })

      expect(result).toBe('success')
      expect(onRetry).toHaveBeenCalledTimes(1)
    })

    it('should pass arguments to callback function', async () => {
      const fn = vi
        .fn()
        .mockImplementation(
          async (a: number, b: number, _c: { signal?: AbortSignal }) => {
            return a + b
          },
        )

      const result = await pRetry(fn, {
        retries: 0,
        args: [5, 10],
      })

      expect(result).toBe(15)
      expect(fn).toHaveBeenCalledWith(5, 10, { signal: expect.any(Object) })
    })

    it('should pass empty args array when not provided', async () => {
      const fn = vi.fn().mockResolvedValue('success')

      await pRetry(fn, { retries: 0 })

      expect(fn).toHaveBeenCalledWith({ signal: expect.any(Object) })
    })

    it('should return undefined when signal is already aborted', async () => {
      const controller = new AbortController()
      controller.abort()

      const fn = vi.fn().mockResolvedValue('success')

      const result = await pRetry(fn, {
        retries: 3,
        signal: controller.signal,
      })

      expect(result).toBeUndefined()
      expect(fn).not.toHaveBeenCalled()
    })

    it('should return undefined when signal aborts during retry delay', async () => {
      // Abort synchronously inside the failing attempt so the retry-delay
      // branch sees an already-aborted signal — no wall-clock race.
      const controller = new AbortController()
      let attempts = 0

      const fn = vi.fn().mockImplementation(async () => {
        attempts += 1
        if (attempts === 1) {
          controller.abort()
          throw new Error('fail')
        }
        return 'success'
      })

      const result = await pRetry(fn, {
        retries: 3,
        baseDelayMs: 50,
        signal: controller.signal,
      })

      expect(result).toBeUndefined()
      expect(attempts).toBe(1)
    })

    it('should handle abort signal between retries', async () => {
      // Same pattern — abort inside the first-attempt rejection so retry
      // observes the aborted signal deterministically.
      const controller = new AbortController()
      let attempts = 0

      const fn = vi.fn().mockImplementation(async () => {
        attempts += 1
        if (attempts === 1) {
          controller.abort()
          throw new Error('fail')
        }
        return 'success'
      })

      const result = await pRetry(fn, {
        retries: 3,
        baseDelayMs: 50,
        signal: controller.signal,
      })

      expect(result).toBeUndefined()
      expect(attempts).toBe(1)
    })

    it('should clamp onRetry custom delay to maxDelayMs', async () => {
      let attempts = 0
      const delays: number[] = []

      const fn = vi.fn().mockImplementation(async () => {
        attempts += 1
        if (attempts < 2) {
          throw new Error('fail')
        }
        return 'success'
      })

      await pRetry(fn, {
        retries: 1,
        baseDelayMs: 100,
        maxDelayMs: 500,
        onRetry: (_attempt, _error, delay) => {
          delays.push(delay)
          return 1000 // Should be clamped to 500
        },
      })

      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('should handle maxDelayMs with jitter', async () => {
      let attempts = 0
      const delays: number[] = []

      const fn = vi.fn().mockImplementation(async () => {
        attempts += 1
        if (attempts < 3) {
          throw new Error('fail')
        }
        return 'success'
      })

      await pRetry(fn, {
        retries: 2,
        baseDelayMs: 200,
        backoffFactor: 3,
        maxDelayMs: 500,
        jitter: true,
        onRetry: (_attempt, _error, delay) => {
          delays.push(delay)
          return undefined
        },
      })

      // All delays should be <= maxDelayMs
      delays.forEach(delay => {
        expect(delay).toBeLessThanOrEqual(500)
      })
    })
  })

  describe('normalizeRetryOptions - Additional Options', () => {
    it('should include args in normalized options', () => {
      const args = [1, 2, 3]
      const options = normalizeRetryOptions({ retries: 3, args })
      expect(options.args).toEqual(args)
    })

    it('should default args to empty array', () => {
      const options = normalizeRetryOptions(3)
      expect(options.args).toEqual([])
    })

    it('should default jitter to true', () => {
      const options = normalizeRetryOptions(3)
      expect(options.jitter).toBe(true)
    })

    it('should allow jitter to be false', () => {
      const options = normalizeRetryOptions({ retries: 3, jitter: false })
      expect(options.jitter).toBe(false)
    })
  })

  describe('normalizeIterationOptions - Edge Cases', () => {
    it('should handle negative concurrency', () => {
      const options = normalizeIterationOptions({ concurrency: -5 })
      expect(options.concurrency).toBe(1)
    })

    it('should handle zero concurrency', () => {
      const options = normalizeIterationOptions(0)
      expect(options.concurrency).toBe(1)
    })

    it('should merge retry options object', () => {
      const retryOpts = {
        retries: 3,
        baseDelayMs: 1000,
        backoffFactor: 3,
      }
      const options = normalizeIterationOptions({
        concurrency: 5,
        retries: retryOpts,
      })
      expect(options.concurrency).toBe(5)
      expect(options.retries.retries).toBe(3)
      expect(options.retries.baseDelayMs).toBe(1000)
      expect(options.retries.backoffFactor).toBe(3)
    })

    it('should use provided signal', () => {
      const controller = new AbortController()
      const options = normalizeIterationOptions({
        concurrency: 2,
        signal: controller.signal,
      })
      expect(options.signal).toBe(controller.signal)
    })

    it('should pass signal to retry options', () => {
      const controller = new AbortController()
      const options = normalizeIterationOptions({
        concurrency: 2,
        signal: controller.signal,
      })
      expect(options.retries.signal).toBe(controller.signal)
    })
  })

  describe('pEach - Edge Cases', () => {
    it('should retry failed item operations', async () => {
      const items = [1, 2, 3]
      let attempts = 0

      await pEach(
        items,
        async _item => {
          attempts += 1
          if (attempts === 2) {
            throw new Error('Temporary failure')
          }
        },
        { concurrency: 1, retries: 2 },
      )

      expect(attempts).toBeGreaterThan(3)
    })

    it('should handle abort signal before first chunk', async () => {
      const controller = new AbortController()
      controller.abort()

      const items = [1, 2, 3, 4]
      const fn = vi.fn()

      await pEach(items, fn, {
        signal: controller.signal,
        concurrency: 2,
      })

      expect(fn).not.toHaveBeenCalled()
    })

    it('should use number as concurrency shorthand', async () => {
      const items = [1, 2, 3, 4]
      const results: number[] = []

      await pEach(
        items,
        async item => {
          results.push(item)
        },
        2,
      )

      expect(results).toEqual([1, 2, 3, 4])
    })

    it('should handle large arrays with high concurrency', async () => {
      const items = Array.from({ length: 1000 }, (_, i) => i + 1)
      let processed = 0

      await pEach(
        items,
        async () => {
          processed += 1
        },
        { concurrency: 50 },
      )

      expect(processed).toBe(1000)
    })
  })

  describe('resolveRetryOptions - Edge Cases', () => {
    it('should handle undefined options', () => {
      const options = resolveRetryOptions(undefined)
      expect(options.retries).toBe(0)
      expect(options.baseDelayMs).toBe(200)
      expect(options.maxDelayMs).toBe(10_000)
      expect(options.backoffFactor).toBe(2)
    })

    it('should preserve custom options', () => {
      const onRetry = vi.fn()
      const options = resolveRetryOptions({
        retries: 5,
        baseDelayMs: 300,
        maxDelayMs: 15_000,
        backoffFactor: 3,
        onRetry,
        onRetryCancelOnFalse: true,
        onRetryRethrow: true,
      })
      expect(options.retries).toBe(5)
      expect(options.baseDelayMs).toBe(300)
      expect(options.maxDelayMs).toBe(15_000)
      expect(options.backoffFactor).toBe(3)
      expect(options.onRetry).toBe(onRetry)
      expect(options.onRetryCancelOnFalse).toBe(true)
      expect(options.onRetryRethrow).toBe(true)
    })

    it('should handle zero retries', () => {
      const options = resolveRetryOptions(0)
      expect(options.retries).toBe(0)
    })
  })

  describe('withResolvers', () => {
    // Spec: https://tc39.es/ecma262/#sec-promise.withResolvers
    // These tests exercise the feature-detect binding. On Node 20.12+ /
    // 22+ the export is bound to native Promise.withResolvers; on older
    // engines it's our fallback. Both paths must satisfy the spec.

    it('is a function', () => {
      expect(typeof withResolvers).toBe('function')
    })

    it('returns an object with promise, resolve, reject', () => {
      const d = withResolvers<number>()
      expect(d.promise).toBeInstanceOf(Promise)
      expect(typeof d.resolve).toBe('function')
      expect(typeof d.reject).toBe('function')
    })

    it('resolves the promise with the provided value', async () => {
      const { promise, resolve } = withResolvers<string>()
      resolve('hello')
      await expect(promise).resolves.toBe('hello')
    })

    it('rejects the promise with the provided reason', async () => {
      const { promise, reject } = withResolvers<number>()
      const err = new Error('boom')
      reject(err)
      await expect(promise).rejects.toBe(err)
    })

    it('adopts a thenable passed to resolve', async () => {
      const { promise, resolve } = withResolvers<number>()
      resolve(Promise.resolve(42))
      await expect(promise).resolves.toBe(42)
    })

    it('rejects when a rejected thenable is passed to resolve', async () => {
      const { promise, resolve } = withResolvers<number>()
      const err = new Error('inner')
      resolve(Promise.reject(err))
      await expect(promise).rejects.toBe(err)
    })

    it('settles exactly once — later resolve() calls are ignored', async () => {
      const { promise, resolve } = withResolvers<string>()
      resolve('first')
      resolve('second')
      await expect(promise).resolves.toBe('first')
    })

    it('settles exactly once — reject after resolve is ignored', async () => {
      const { promise, resolve, reject } = withResolvers<string>()
      resolve('ok')
      reject(new Error('late'))
      await expect(promise).resolves.toBe('ok')
    })

    it('supports deferred resolution from outside the executor', async () => {
      // The point of withResolvers: settle from code that doesn't own the
      // executor. Here an event-style callback closes over `resolve`.
      const { promise, resolve } = withResolvers<string>()
      setTimeout(() => resolve('fired'), 0)
      await expect(promise).resolves.toBe('fired')
    })

    it('each call returns a fresh, independent capability', async () => {
      const a = withResolvers<number>()
      const b = withResolvers<number>()
      expect(a.promise).not.toBe(b.promise)
      expect(a.resolve).not.toBe(b.resolve)
      a.resolve(1)
      b.resolve(2)
      await expect(a.promise).resolves.toBe(1)
      await expect(b.promise).resolves.toBe(2)
    })

    // Spec §27.2.4.9 step 3: `OrdinaryObjectCreate(%Object.prototype%)`.
    // The returned object is a plain object, not a Promise / subclass.
    it('returned object has Object.prototype as its prototype', () => {
      const d = withResolvers<number>()
      expect(Object.getPrototypeOf(d)).toBe(Object.prototype)
    })

    // Spec §27.2.4.9 steps 4-6: properties created via
    // `CreateDataPropertyOrThrow` — writable, enumerable, configurable.
    it('promise/resolve/reject are own enumerable properties', () => {
      const d = withResolvers<number>()
      const keys = Object.keys(d)
      expect(keys).toContain('promise')
      expect(keys).toContain('resolve')
      expect(keys).toContain('reject')
    })
  })

  // Explicit coverage of the fallback branch. On Node 20.12+ / 22+ the
  // module binds to native `Promise.withResolvers` at import time, so
  // normal runs exercise only the native path. Here we delete the native
  // method and re-import the module fresh, forcing the feature-detect
  // to pick the closure fallback.
  describe('withResolvers — fallback implementation', () => {
    const hadNative =
      typeof (Promise as unknown as { withResolvers?: unknown })
        .withResolvers === 'function'
    const nativeWithResolvers = hadNative
      ? (
          Promise as unknown as {
            withResolvers: () => unknown
          }
        ).withResolvers
      : undefined

    afterEach(() => {
      if (hadNative && nativeWithResolvers) {
        ;(
          Promise as unknown as { withResolvers: () => unknown }
        ).withResolvers = nativeWithResolvers
      }
      vi.resetModules()
    })

    async function loadFallback(): Promise<
      () => { promise: Promise<unknown>; resolve: Function; reject: Function }
    > {
      delete (Promise as unknown as { withResolvers?: unknown }).withResolvers
      vi.resetModules()
      const mod = await import('@socketsecurity/lib/promises')
      return mod.withResolvers as () => {
        promise: Promise<unknown>
        resolve: Function
        reject: Function
      }
    }

    it('fallback is a function', async () => {
      const fallback = await loadFallback()
      expect(typeof fallback).toBe('function')
    })

    it('fallback returns { promise, resolve, reject } with correct types', async () => {
      const fallback = await loadFallback()
      const d = fallback()
      expect(d.promise).toBeInstanceOf(Promise)
      expect(typeof d.resolve).toBe('function')
      expect(typeof d.reject).toBe('function')
    })

    it('fallback resolves the promise with the provided value', async () => {
      const fallback = await loadFallback()
      const d = fallback()
      d.resolve('ok')
      await expect(d.promise).resolves.toBe('ok')
    })

    it('fallback rejects the promise with the provided reason', async () => {
      const fallback = await loadFallback()
      const d = fallback()
      const err = new Error('nope')
      d.reject(err)
      await expect(d.promise).rejects.toBe(err)
    })

    it('fallback adopts a thenable passed to resolve', async () => {
      const fallback = await loadFallback()
      const d = fallback()
      d.resolve(Promise.resolve(99))
      await expect(d.promise).resolves.toBe(99)
    })

    it('fallback settle-once semantics (later calls ignored)', async () => {
      const fallback = await loadFallback()
      const d = fallback()
      d.resolve('first')
      d.resolve('second')
      d.reject(new Error('late'))
      await expect(d.promise).resolves.toBe('first')
    })

    // Spec §27.2.4.9 step 3: return object has Object.prototype.
    it('fallback returns an ordinary object, not a Promise subclass', async () => {
      const fallback = await loadFallback()
      const d = fallback()
      expect(Object.getPrototypeOf(d)).toBe(Object.prototype)
    })

    it('fallback properties are own + enumerable', async () => {
      const fallback = await loadFallback()
      const d = fallback()
      const keys = Object.keys(d)
      expect(keys).toContain('promise')
      expect(keys).toContain('resolve')
      expect(keys).toContain('reject')
    })
  })

  describe('fromAsync', () => {
    // Spec: https://tc39.es/proposal-array-from-async/
    // On Node 22+ the export is bound to native Array.fromAsync; older
    // engines hit the closure fallback. Both paths must satisfy the spec.

    it('is a function', () => {
      expect(typeof fromAsync).toBe('function')
    })

    it('drains an async iterable into an array', async () => {
      async function* gen() {
        yield 1
        yield 2
        yield 3
      }
      await expect(fromAsync(gen())).resolves.toEqual([1, 2, 3])
    })

    it('returns an empty array for an empty async iterable', async () => {
      // eslint-disable-next-line require-yield
      async function* empty() {
        return
      }
      await expect(fromAsync(empty())).resolves.toEqual([])
    })

    it('preserves yield order', async () => {
      async function* gen() {
        yield 'b'
        yield 'a'
        yield 'c'
      }
      await expect(fromAsync(gen())).resolves.toEqual(['b', 'a', 'c'])
    })

    it('awaits each yielded value before pushing', async () => {
      async function* gen() {
        yield Promise.resolve(1)
        yield Promise.resolve(2)
      }
      // Spec: yielded thenables are awaited; resulting array contains
      // the resolved values, not the promises.
      const out = await fromAsync(gen())
      expect(out).toEqual([1, 2])
    })

    it('propagates rejection from the iterator', async () => {
      const err = new Error('boom')
      async function* gen() {
        yield 1
        throw err
      }
      await expect(fromAsync(gen())).rejects.toBe(err)
    })

    it('also drains plain (sync) iterables of awaitables', async () => {
      // Spec lets fromAsync accept Iterable<T | PromiseLike<T>> too.
      const out = await fromAsync([Promise.resolve('a'), Promise.resolve('b')])
      expect(out).toEqual(['a', 'b'])
    })
  })

  // Explicit coverage of the fallback branch. On Node 22+ the module
  // binds to native `Array.fromAsync` at import time; here we delete
  // the native method and re-import the module fresh, forcing the
  // feature-detect to pick the closure fallback.
  describe('fromAsync — fallback implementation', () => {
    const hadNative =
      typeof (Array as unknown as { fromAsync?: unknown }).fromAsync ===
      'function'
    const nativeFromAsync = hadNative
      ? (Array as unknown as { fromAsync: unknown }).fromAsync
      : undefined

    afterEach(() => {
      if (hadNative && nativeFromAsync !== undefined) {
        ;(Array as unknown as { fromAsync: unknown }).fromAsync =
          nativeFromAsync
      }
      vi.resetModules()
    })

    async function loadFallback(): Promise<
      <T>(
        source: AsyncIterable<T> | Iterable<T | PromiseLike<T>>,
      ) => Promise<T[]>
    > {
      delete (Array as unknown as { fromAsync?: unknown }).fromAsync
      vi.resetModules()
      const mod = await import('@socketsecurity/lib/promises')
      return mod.fromAsync
    }

    it('fallback is a function', async () => {
      const fallback = await loadFallback()
      expect(typeof fallback).toBe('function')
    })

    it('fallback drains an async iterable into an array', async () => {
      const fallback = await loadFallback()
      async function* gen() {
        yield 'x'
        yield 'y'
      }
      await expect(fallback(gen())).resolves.toEqual(['x', 'y'])
    })

    it('fallback returns empty array for empty iterable', async () => {
      const fallback = await loadFallback()
      // eslint-disable-next-line require-yield
      async function* empty() {
        return
      }
      await expect(fallback(empty())).resolves.toEqual([])
    })

    it('fallback propagates rejection from the iterator', async () => {
      const fallback = await loadFallback()
      const err = new Error('fallback-boom')
      async function* gen() {
        yield 1
        throw err
      }
      await expect(fallback(gen())).rejects.toBe(err)
    })
  })
})
