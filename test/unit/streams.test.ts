/**
 * @fileoverview Unit tests for async stream processing utilities.
 *
 * Tests async iterable stream transformers:
 * - parallelMap() transforms async iterables with parallel mapping
 * - parallelEach() iterates async iterables with side effects
 * - transform() creates custom stream transformations
 * - Concurrency control for async streams
 * - Error handling in stream pipelines
 * Used by Socket tools for processing large datasets and streaming operations.
 */

import {
  parallelEach,
  parallelMap,
  transform,
} from '@socketsecurity/lib/streams'
import { describe, expect, it } from 'vitest'

// Helper to create async iterable from array
async function* asyncIterable<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) {
    yield item
  }
}

// Helper to collect async iterable into array
async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const results: T[] = []
  for await (const item of iterable) {
    results.push(item)
  }
  return results
}

describe('streams', () => {
  describe('parallelMap', () => {
    it('should map over array', async () => {
      const input = [1, 2, 3]
      const result = parallelMap(input, async x => x * 2)
      const output = await collect(result)
      expect(output).toEqual([2, 4, 6])
    })

    it('should map over async iterable', async () => {
      const input = asyncIterable([1, 2, 3])
      const result = parallelMap(input, async x => x * 2)
      const output = await collect(result)
      expect(output).toEqual([2, 4, 6])
    })

    it('should handle empty iterable', async () => {
      const input: number[] = []
      const result = parallelMap(input, async x => x * 2)
      const output = await collect(result)
      expect(output).toEqual([])
    })

    it('should accept concurrency as number', async () => {
      const input = [1, 2, 3, 4, 5]
      const result = parallelMap(input, async x => x + 1, 2)
      const output = await collect(result)
      expect(output).toEqual([2, 3, 4, 5, 6])
    })

    it('should accept options object', async () => {
      const input = [1, 2, 3]
      const result = parallelMap(input, async x => x * 2, { concurrency: 2 })
      const output = await collect(result)
      expect(output).toEqual([2, 4, 6])
    })

    it('should handle strings', async () => {
      const input = ['a', 'b', 'c']
      const result = parallelMap(input, async x => x.toUpperCase())
      const output = await collect(result)
      expect(output).toEqual(['A', 'B', 'C'])
    })

    it('should handle objects', async () => {
      const input = [{ id: 1 }, { id: 2 }]
      const result = parallelMap(input, async x => ({
        ...x,
        doubled: x.id * 2,
      }))
      const output = await collect(result)
      expect(output).toEqual([
        { id: 1, doubled: 2 },
        { id: 2, doubled: 4 },
      ])
    })

    it('should work with async operations', async () => {
      const input = [10, 20, 30]
      const result = parallelMap(input, async x => {
        await new Promise(resolve => setTimeout(resolve, 1))
        return x / 10
      })
      const output = await collect(result)
      expect(output).toEqual([1, 2, 3])
    })

    it('should return async iterable', () => {
      const input = [1, 2, 3]
      const result = parallelMap(input, async x => x * 2)
      expect(result[Symbol.asyncIterator]).toBeDefined()
    })
  })

  describe('transform', () => {
    it('should transform array', async () => {
      const input = [1, 2, 3]
      const result = transform(input, async x => x * 3)
      const output = await collect(result)
      expect(output).toEqual([3, 6, 9])
    })

    it('should transform async iterable', async () => {
      const input = asyncIterable([1, 2, 3])
      const result = transform(input, async x => x + 10)
      const output = await collect(result)
      expect(output).toEqual([11, 12, 13])
    })

    it('should handle empty iterable', async () => {
      const input: number[] = []
      const result = transform(input, async x => x * 2)
      const output = await collect(result)
      expect(output).toEqual([])
    })

    it('should accept concurrency as number', async () => {
      const input = [1, 2, 3]
      const result = transform(input, async x => x * 2, 2)
      const output = await collect(result)
      expect(output).toEqual([2, 4, 6])
    })

    it('should accept options object', async () => {
      const input = [1, 2, 3]
      const result = transform(input, async x => x * 2, { concurrency: 3 })
      const output = await collect(result)
      expect(output).toEqual([2, 4, 6])
    })

    it('should handle complex transformations', async () => {
      const input = ['hello', 'world']
      const result = transform(input, async x => ({
        original: x,
        length: x.length,
        upper: x.toUpperCase(),
      }))
      const output = await collect(result)
      expect(output).toEqual([
        { original: 'hello', length: 5, upper: 'HELLO' },
        { original: 'world', length: 5, upper: 'WORLD' },
      ])
    })

    it('should return async iterable', () => {
      const input = [1, 2, 3]
      const result = transform(input, async x => x * 2)
      expect(result[Symbol.asyncIterator]).toBeDefined()
    })
  })

  describe('parallelEach', () => {
    it('should execute function for each item', async () => {
      const input = [1, 2, 3]
      const results: number[] = []
      await parallelEach(input, async x => {
        results.push(x * 2)
      })
      expect(results.sort()).toEqual([2, 4, 6])
    })

    it('should work with async iterable', async () => {
      const input = asyncIterable([1, 2, 3])
      const results: number[] = []
      await parallelEach(input, async x => {
        results.push(x)
      })
      expect(results.sort()).toEqual([1, 2, 3])
    })

    it('should handle empty iterable', async () => {
      const input: number[] = []
      const results: number[] = []
      await parallelEach(input, async x => {
        results.push(x)
      })
      expect(results).toEqual([])
    })

    it('should accept concurrency as number', async () => {
      const input = [1, 2, 3]
      const results: number[] = []
      await parallelEach(
        input,
        async x => {
          results.push(x)
        },
        2,
      )
      expect(results.sort()).toEqual([1, 2, 3])
    })

    it('should accept options object', async () => {
      const input = [1, 2, 3]
      const results: number[] = []
      await parallelEach(
        input,
        async x => {
          results.push(x)
        },
        { concurrency: 2 },
      )
      expect(results.sort()).toEqual([1, 2, 3])
    })

    it('should handle side effects', async () => {
      const input = ['a', 'b', 'c']
      const results: string[] = []
      await parallelEach(input, async x => {
        await new Promise(resolve => setTimeout(resolve, 1))
        results.push(x.toUpperCase())
      })
      expect(results.sort()).toEqual(['A', 'B', 'C'])
    })

    it('should return promise that resolves', async () => {
      const input = [1, 2, 3]
      const result = parallelEach(input, async () => {})
      expect(result).toBeInstanceOf(Promise)
      await result
    })

    it('should complete without returning values', async () => {
      const input = [1, 2, 3]
      const result = await parallelEach(input, async () => {
        // Just execute, no return
      })
      expect(result).toBeUndefined()
    })
  })

  describe('integration', () => {
    it('should work with chained operations', async () => {
      const input = [1, 2, 3]
      const doubled = parallelMap(input, async x => x * 2)
      const tripled = parallelMap(doubled, async x => x * 3)
      const output = await collect(tripled)
      expect(output).toEqual([6, 12, 18])
    })

    it('should handle mixed sync and async iterables', async () => {
      const syncInput = [1, 2, 3]
      const asyncInput = asyncIterable([4, 5, 6])

      const result1 = parallelMap(syncInput, async x => x)
      const result2 = parallelMap(asyncInput, async x => x)

      const output1 = await collect(result1)
      const output2 = await collect(result2)

      expect(output1).toEqual([1, 2, 3])
      expect(output2).toEqual([4, 5, 6])
    })

    it('should work with different data types', async () => {
      const numbers = [1, 2, 3]
      const strings = ['a', 'b', 'c']
      const booleans = [true, false, true]

      const n = await collect(parallelMap(numbers, async x => x))
      const s = await collect(parallelMap(strings, async x => x))
      const b = await collect(parallelMap(booleans, async x => x))

      expect(n).toEqual([1, 2, 3])
      expect(s).toEqual(['a', 'b', 'c'])
      expect(b).toEqual([true, false, true])
    })
  })

  describe('edge cases', () => {
    it('should handle single item', async () => {
      const input = [42]
      const result = parallelMap(input, async x => x)
      const output = await collect(result)
      expect(output).toEqual([42])
    })

    it('should handle large datasets', async () => {
      const input = Array.from({ length: 100 }, (_, i) => i)
      const result = parallelMap(input, async x => x * 2)
      const output = await collect(result)
      expect(output.length).toBe(100)
      expect(output[0]).toBe(0)
      expect(output[99]).toBe(198)
    })

    it('should handle zero values', async () => {
      const input = [0, 0, 0]
      const result = parallelMap(input, async x => x + 1)
      const output = await collect(result)
      expect(output).toEqual([1, 1, 1])
    })

    it('should handle negative numbers', async () => {
      const input = [-1, -2, -3]
      const result = parallelMap(input, async x => Math.abs(x))
      const output = await collect(result)
      expect(output).toEqual([1, 2, 3])
    })
  })

  describe('error handling and retries', () => {
    it('should handle errors in parallelMap', async () => {
      const input = [1, 2, 3]
      const result = parallelMap(input, async x => {
        if (x === 2) {
          throw new Error('Test error')
        }
        return x * 2
      })
      await expect(collect(result)).rejects.toThrow('Test error')
    })

    it('should handle errors in transform', async () => {
      const input = [1, 2, 3]
      const result = transform(input, async x => {
        if (x === 2) {
          throw new Error('Transform error')
        }
        return x * 2
      })
      await expect(collect(result)).rejects.toThrow('Transform error')
    })

    it('should handle errors in parallelEach', async () => {
      const input = [1, 2, 3]
      const results: number[] = []
      await expect(
        parallelEach(input, async x => {
          if (x === 2) {
            throw new Error('Each error')
          }
          results.push(x)
        }),
      ).rejects.toThrow('Each error')
    })

    it('should work with retry options - success after retry', async () => {
      const input = [1, 2, 3]
      let attempt = 0
      const result = parallelMap(
        input,
        async x => {
          if (x === 2 && attempt++ === 0) {
            throw new Error('Temporary error')
          }
          return x * 2
        },
        { concurrency: 1, retries: { retries: 2 } },
      )
      const output = await collect(result)
      expect(output).toEqual([2, 4, 6])
    })

    it('should respect concurrency limit in parallelMap', async () => {
      const input = [1, 2, 3, 4, 5]
      let concurrent = 0
      let maxConcurrent = 0
      const result = parallelMap(
        input,
        async x => {
          concurrent++
          maxConcurrent = Math.max(maxConcurrent, concurrent)
          await new Promise(resolve => setTimeout(resolve, 10))
          concurrent--
          return x
        },
        { concurrency: 2 },
      )
      await collect(result)
      expect(maxConcurrent).toBeLessThanOrEqual(2)
    })

    it('should respect concurrency limit in transform', async () => {
      const input = [1, 2, 3, 4, 5]
      let concurrent = 0
      let maxConcurrent = 0
      const result = transform(
        input,
        async x => {
          concurrent++
          maxConcurrent = Math.max(maxConcurrent, concurrent)
          await new Promise(resolve => setTimeout(resolve, 10))
          concurrent--
          return x
        },
        { concurrency: 2 },
      )
      await collect(result)
      expect(maxConcurrent).toBeLessThanOrEqual(2)
    })

    it('should handle async iterable errors', async () => {
      async function* errorIterable() {
        yield 1
        yield 2
        throw new Error('Iterable error')
      }
      const result = parallelMap(errorIterable(), async x => x * 2)
      await expect(collect(result)).rejects.toThrow('Iterable error')
    })

    it('should handle undefined options gracefully', async () => {
      const input = [1, 2, 3]
      const result = parallelMap(input, async x => x * 2, undefined)
      const output = await collect(result)
      expect(output).toEqual([2, 4, 6])
    })

    it('should handle null-like values in data', async () => {
      const input = [null, undefined, 0, '', false]
      const result = parallelMap(input, async x => String(x))
      const output = await collect(result)
      expect(output).toEqual(['null', 'undefined', '0', '', 'false'])
    })

    it('should work with higher concurrency than items', async () => {
      const input = [1, 2]
      const result = parallelMap(input, async x => x * 2, { concurrency: 10 })
      const output = await collect(result)
      expect(output).toEqual([2, 4])
    })

    it('should handle promises that resolve to undefined', async () => {
      const input = [1, 2, 3]
      const result = parallelMap(input, async () => undefined)
      const output = await collect(result)
      expect(output).toEqual([undefined, undefined, undefined])
    })

    it('should handle transform with different output types', async () => {
      const input = [1, 2, 3]
      const result = transform(input, async x => `item-${x}`)
      const output = await collect(result)
      expect(output).toEqual(['item-1', 'item-2', 'item-3'])
    })

    it('should handle parallelEach with async delays', async () => {
      const input = [1, 2, 3]
      const results: Array<{ value: number; time: number }> = []
      const start = Date.now()
      await parallelEach(
        input,
        async x => {
          await new Promise(resolve => setTimeout(resolve, 5))
          results.push({ value: x, time: Date.now() - start })
        },
        { concurrency: 3 },
      )
      expect(results.length).toBe(3)
      expect(results.map(r => r.value).sort()).toEqual([1, 2, 3])
    })
  })
})
