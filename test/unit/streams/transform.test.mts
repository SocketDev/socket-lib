import { describe, expect, it } from 'vitest'

import { transform } from '../../../src/streams/transform'
import { tolerantSleep } from '../../_shared/fleet/lib/timing.mts'

async function* asyncIterable<T>(items: T[]): AsyncIterable<T> {
  for (let i = 0, { length } = items; i < length; i += 1) {
    const item = items[i]!
    yield item
  }
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const results: T[] = []
  for await (const item of iterable) {
    results.push(item)
  }
  return results
}

describe('streams/transform', () => {
  it('transforms array', async () => {
    const input = [1, 2, 3]
    const result = transform(input, async x => x * 3)
    const output = await collect(result)
    expect(output).toEqual([3, 6, 9])
  })

  it('transforms async iterable', async () => {
    const input = asyncIterable([1, 2, 3])
    const result = transform(input, async x => x + 10)
    const output = await collect(result)
    expect(output).toEqual([11, 12, 13])
  })

  it('handles empty iterable', async () => {
    const input: number[] = []
    const result = transform(input, async x => x * 2)
    const output = await collect(result)
    expect(output).toEqual([])
  })

  it('accepts concurrency as number', async () => {
    const input = [1, 2, 3]
    const result = transform(input, async x => x * 2, 2)
    const output = await collect(result)
    expect(output).toEqual([2, 4, 6])
  })

  it('accepts options object', async () => {
    const input = [1, 2, 3]
    const result = transform(input, async x => x * 2, { concurrency: 3 })
    const output = await collect(result)
    expect(output).toEqual([2, 4, 6])
  })

  it('handles complex transformations', async () => {
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

  it('returns async iterable', () => {
    const input = [1, 2, 3]
    const result = transform(input, async x => x * 2)
    expect(result[Symbol.asyncIterator]).toBeDefined()
  })

  it('handles errors in transform', async () => {
    const input = [1, 2, 3]
    const result = transform(input, async x => {
      if (x === 2) {
        throw new Error('Transform error')
      }
      return x * 2
    })
    await expect(collect(result)).rejects.toThrow('Transform error')
  })

  it('respects concurrency limit', async () => {
    const input = [1, 2, 3, 4, 5]
    let concurrent = 0
    let maxConcurrent = 0
    const result = transform(
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

  it('handles transform with different output types', async () => {
    const input = [1, 2, 3]
    const result = transform(input, async x => `item-${x}`)
    const output = await collect(result)
    expect(output).toEqual(['item-1', 'item-2', 'item-3'])
  })
})
