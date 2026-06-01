/**
 * @file Unit tests for async filtering utilities. Tests promise-based filter
 *   helpers:
 *
 *   - pFilter() filters arrays with an async predicate + concurrency control
 *   - pFilterChunk() filters chunked arrays with an async predicate
 *
 *   The pEach()/pEachChunk() iteration helpers and normalizeIterationOptions()
 *   live in promises-iterate.test.mts.
 */

import { pFilter, pFilterChunk } from '../../src/promises/iterate'
import { describe, expect, it } from 'vitest'

describe('promises', () => {
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
})
