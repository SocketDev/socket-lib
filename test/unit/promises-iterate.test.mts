/**
 * @file Unit tests for async iteration utilities. Tests promise-based iteration
 *   helpers and their option normalizer:
 *
 *   - pEach(), pEachChunk() iterate async operations with concurrency control
 *   - normalizeIterationOptions() iteration option normalizer Filtering helpers
 *     (pFilter, pFilterChunk) live in promises-filter.test.mts; retry helpers
 *     (pRetry, normalizeRetryOptions, resolveRetryOptions) live in
 *     promises.test.mts / promises-options.test.mts; resolver helpers live in
 *     promises-resolvers.test.mts.
 */

import { tolerantSleep } from '../_shared/fleet/lib/timing.mts'
import { pEach, pEachChunk } from '../../src/promises/iterate'
import { normalizeIterationOptions } from '../../src/promises/options'
import { describe, expect, it, vi } from 'vitest'

describe('promises', () => {
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
          await new Promise(resolve => setTimeout(resolve, tolerantSleep(10)))
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
})
