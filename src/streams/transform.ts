/**
 * @file Streaming transform helper — `transform()` wraps
 *   `streaming-iterables.transform` with the project's `pRetry` per-item retry
 *   policy.
 */

import { transform as siTransform } from '../external/streaming-iterables'
import { normalizeIterationOptions } from '../promises/options'
import { pRetry } from '../promises/retry'

import type { IterationOptions } from '../promises/types'

/**
 * Transform an iterable with a function.
 *
 * @example
 *   ;```typescript
 *   const lines = ['hello', 'world']
 *   for await (const upper of transform(lines, async line => {
 *     return line.toUpperCase()
 *   })) {
 *     console.log(upper) // 'HELLO', 'WORLD'
 *   }
 *   ```
 */
export function transform<T, U>(
  iterable: Iterable<T> | AsyncIterable<T>,
  func: (item: T) => Promise<U>,
  options?: number | IterationOptions,
): AsyncIterable<U> {
  const opts = normalizeIterationOptions(options)
  /* c8 ignore next - External streaming-iterables call */
  const result = siTransform(
    opts.concurrency,
    async (item: T) => {
      const retryResult = await pRetry(
        (...args: unknown[]) => func(args[0] as T),
        {
          ...opts.retries,
          args: [item],
        },
      )
      return retryResult as U
    },
    iterable,
  )
  return result as AsyncIterable<U>
}
