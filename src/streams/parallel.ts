/**
 * @file Parallel iteration helpers — `parallelMap()` and the fire-and-forget
 *   `parallelEach()`. Built on top of `streaming-iterables.parallelMap` with
 *   the project's `pRetry` wrapper applied per item.
 */

import { parallelMap as siParallelMap } from '../external/streaming-iterables'
import { normalizeIterationOptions } from '../promises/options'
import { pRetry } from '../promises/retry'

import type { IterationOptions } from '../promises/types'

/**
 * Execute a function for each item in an iterable in parallel.
 *
 * @example
 *   ;```typescript
 *   const urls = ['https://a.io', 'https://b.io']
 *   await parallelEach(
 *     urls,
 *     async url => {
 *       await fetch(url)
 *     },
 *     { concurrency: 4 },
 *   )
 *   ```
 */
export async function parallelEach<T>(
  iterable: Iterable<T> | AsyncIterable<T>,
  func: (item: T) => Promise<unknown>,
  options?: number | IterationOptions,
): Promise<void> {
  for await (const _ of parallelMap(iterable, func, options)) {
    /* empty block */
  }
}

/**
 * Map over an iterable in parallel with concurrency control.
 *
 * @example
 *   ;```typescript
 *   const ids = [1, 2, 3]
 *   for await (const result of parallelMap(
 *     ids,
 *     async id => {
 *       return await fetchData(id)
 *     },
 *     4,
 *   )) {
 *     console.log(result)
 *   }
 *   ```
 */
export function parallelMap<T, U>(
  iterable: Iterable<T> | AsyncIterable<T>,
  func: (item: T) => Promise<U>,
  options?: number | IterationOptions,
): AsyncIterable<U> {
  const opts = normalizeIterationOptions(options)
  /* c8 ignore next - External streaming-iterables call */
  const result = siParallelMap(
    opts.concurrency,
    async (item: T) => {
      const mapped = await pRetry((...args: unknown[]) => func(args[0] as T), {
        ...opts.retries,
        args: [item],
      })
      return mapped as U
    },
    iterable,
  )
  return result as AsyncIterable<U>
}
