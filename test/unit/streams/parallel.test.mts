import { describe, expect, it } from 'vitest'

import { parallelEach, parallelMap } from '../../../src/streams/parallel'
import { tolerantSleep } from '../../_shared/fleet/lib/timing.mts'

export async function* asyncIterable<T>(items: T[]): AsyncIterable<T> {
  for (let i = 0, { length } = items; i < length; i += 1) {
    const item = items[i]!
    yield item
  }
}

export async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const results: T[] = []
  for await (const item of iterable) {
    results.push(item)
  }
  return results
}

describe('streams/parallel — parallelMap', () => {
  it('maps over array', async () => {
    const input = [1, 2, 3]
    const result = parallelMap(input, async x => x * 2)
    const output = await collect(result)
    expect(output).toEqual([2, 4, 6])
  })

  it('maps over async iterable', async () => {
    const input = asyncIterable([1, 2, 3])
    const result = parallelMap(input, async x => x * 2)
    const output = await collect(result)
    expect(output).toEqual([2, 4, 6])
  })

  it('handles empty iterable', async () => {
    const input: number[] = []
    const result = parallelMap(input, async x => x * 2)
    const output = await collect(result)
    expect(output).toEqual([])
  })

  it('accepts concurrency as number', async () => {
    const input = [1, 2, 3, 4, 5]
    const result = parallelMap(input, async x => x + 1, 2)
    const output = await collect(result)
    expect(output).toEqual([2, 3, 4, 5, 6])
  })

  it('accepts options object', async () => {
    const input = [1, 2, 3]
    const result = parallelMap(input, async x => x * 2, { concurrency: 2 })
    const output = await collect(result)
    expect(output).toEqual([2, 4, 6])
  })

  it('handles strings', async () => {
    const input = ['a', 'b', 'c']
    const result = parallelMap(input, async x => x.toUpperCase())
    const output = await collect(result)
    expect(output).toEqual(['A', 'B', 'C'])
  })

  it('handles objects', async () => {
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

  it('works with async operations', async () => {
    const input = [10, 20, 30]
    const result = parallelMap(input, async x => {
      await Promise.resolve()
      return x / 10
    })
    const output = await collect(result)
    expect(output).toEqual([1, 2, 3])
  })

  it('returns async iterable', () => {
    const input = [1, 2, 3]
    const result = parallelMap(input, async x => x * 2)
    expect(result[Symbol.asyncIterator]).toBeDefined()
  })
})

describe('streams/parallel — parallelEach', () => {
  it('executes function for each item', async () => {
    const input = [1, 2, 3]
    const results: number[] = []
    await parallelEach(input, async x => {
      results.push(x * 2)
    })
    expect(results.toSorted()).toEqual([2, 4, 6])
  })

  it('works with async iterable', async () => {
    const input = asyncIterable([1, 2, 3])
    const results: number[] = []
    await parallelEach(input, async x => {
      results.push(x)
    })
    expect(results.toSorted()).toEqual([1, 2, 3])
  })

  it('handles empty iterable', async () => {
    const input: number[] = []
    const results: number[] = []
    await parallelEach(input, async x => {
      results.push(x)
    })
    expect(results).toEqual([])
  })

  it('accepts concurrency as number', async () => {
    const input = [1, 2, 3]
    const results: number[] = []
    await parallelEach(
      input,
      async x => {
        results.push(x)
      },
      2,
    )
    expect(results.toSorted()).toEqual([1, 2, 3])
  })

  it('accepts options object', async () => {
    const input = [1, 2, 3]
    const results: number[] = []
    await parallelEach(
      input,
      async x => {
        results.push(x)
      },
      { concurrency: 2 },
    )
    expect(results.toSorted()).toEqual([1, 2, 3])
  })

  it('handles side effects', async () => {
    const input = ['a', 'b', 'c']
    const results: string[] = []
    await parallelEach(input, async x => {
      await Promise.resolve()
      results.push(x.toUpperCase())
    })
    expect(results.toSorted()).toEqual(['A', 'B', 'C'])
  })

  it('returns promise that resolves', async () => {
    const input = [1, 2, 3]
    const result = parallelEach(input, async () => {})
    expect(result).toBeInstanceOf(Promise)
    await result
  })

  it('completes without returning values', async () => {
    const input = [1, 2, 3]
    const result = await parallelEach(input, async () => {
      // no return
    })
    expect(result).toBeUndefined()
  })
})

describe('streams/parallel — integration', () => {
  it('works with chained operations', async () => {
    const input = [1, 2, 3]
    const doubled = parallelMap(input, async x => x * 2)
    const tripled = parallelMap(doubled, async x => x * 3)
    const output = await collect(tripled)
    expect(output).toEqual([6, 12, 18])
  })

  it('handles mixed sync and async iterables', async () => {
    const syncInput = [1, 2, 3]
    const asyncInput = asyncIterable([4, 5, 6])

    const result1 = parallelMap(syncInput, async x => x)
    const result2 = parallelMap(asyncInput, async x => x)

    const output1 = await collect(result1)
    const output2 = await collect(result2)

    expect(output1).toEqual([1, 2, 3])
    expect(output2).toEqual([4, 5, 6])
  })

  it('works with different data types', async () => {
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

describe('streams/parallel — edge cases', () => {
  it('handles single item', async () => {
    const input = [42]
    const result = parallelMap(input, async x => x)
    const output = await collect(result)
    expect(output).toEqual([42])
  })

  it('handles large datasets', async () => {
    const input = Array.from({ length: 100 }, (_, i) => i)
    const result = parallelMap(input, async x => x * 2)
    const output = await collect(result)
    expect(output.length).toBe(100)
    expect(output[0]).toBe(0)
    expect(output[99]).toBe(198)
  })

  it('handles zero values', async () => {
    const input = [0, 0, 0]
    const result = parallelMap(input, async x => x + 1)
    const output = await collect(result)
    expect(output).toEqual([1, 1, 1])
  })

  it('handles negative numbers', async () => {
    const input = [-1, -2, -3]
    const result = parallelMap(input, async x => Math.abs(x))
    const output = await collect(result)
    expect(output).toEqual([1, 2, 3])
  })
})

describe('streams/parallel — error handling', () => {
  it('handles errors in parallelMap', async () => {
    const input = [1, 2, 3]
    const result = parallelMap(input, async x => {
      if (x === 2) {
        throw new Error('Test error')
      }
      return x * 2
    })
    await expect(collect(result)).rejects.toThrow('Test error')
  })

  it('handles errors in parallelEach', async () => {
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

  it('works with retry options - success after retry', async () => {
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

  it('respects concurrency limit in parallelMap', async () => {
    const input = [1, 2, 3, 4, 5]
    let concurrent = 0
    let maxConcurrent = 0
    const result = parallelMap(
      input,
      async x => {
        concurrent++
        maxConcurrent = Math.max(maxConcurrent, concurrent)
        await new Promise(resolve => setTimeout(resolve, tolerantSleep(10)))
        concurrent--
        return x
      },
      { concurrency: 2 },
    )
    await collect(result)
    expect(maxConcurrent).toBeLessThanOrEqual(2)
  })

  it('handles async iterable errors', async () => {
    async function* errorIterable() {
      yield 1
      yield 2
      throw new Error('Iterable error')
    }
    const result = parallelMap(errorIterable(), async x => x * 2)
    await expect(collect(result)).rejects.toThrow('Iterable error')
  })

  it('handles undefined options gracefully', async () => {
    const input = [1, 2, 3]
    const result = parallelMap(input, async x => x * 2, undefined)
    const output = await collect(result)
    expect(output).toEqual([2, 4, 6])
  })

  it('handles null-like values in data', async () => {
    // oxlint-disable-next-line socket/prefer-undefined-over-null -- test intentionally includes null to verify null-like handling
    const input = [null, undefined, 0, '', false]
    const result = parallelMap(input, async x => String(x))
    const output = await collect(result)
    expect(output).toEqual(['null', 'undefined', '0', '', 'false'])
  })

  it('works with higher concurrency than items', async () => {
    const input = [1, 2]
    const result = parallelMap(input, async x => x * 2, { concurrency: 10 })
    const output = await collect(result)
    expect(output).toEqual([2, 4])
  })

  it('handles promises that resolve to undefined', async () => {
    const input = [1, 2, 3]
    const result = parallelMap(input, async () => undefined)
    const output = await collect(result)
    expect(output).toEqual([undefined, undefined, undefined])
  })

  it('handles parallelEach with async delays', async () => {
    const input = [1, 2, 3]
    const results: Array<{ value: number; time: number }> = []
    const start = Date.now()
    await parallelEach(
      input,
      async x => {
        await new Promise(resolve => setTimeout(resolve, tolerantSleep(5)))
        results.push({ value: x, time: Date.now() - start })
      },
      { concurrency: 3 },
    )
    expect(results.length).toBe(3)
    expect(results.map(r => r.value).toSorted()).toEqual([1, 2, 3])
  })
})
