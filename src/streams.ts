/**
 * @fileoverview Stream processing utilities with streaming-iterables integration.
 * Provides async stream handling and transformation functions.
 */

import {
  parallelMap as siParallelMap,
  transform as siTransform,
} from './external/streaming-iterables'
import type { IterationOptions } from './promises'
import { normalizeIterationOptions, pRetry } from './promises'

/**
 * Execute a function for each item in an iterable in parallel.
 */
/*@__NO_SIDE_EFFECTS__*/
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
 */
/*@__NO_SIDE_EFFECTS__*/
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
      const result = await pRetry((...args: unknown[]) => func(args[0] as T), {
        ...opts.retries,
        args: [item],
      })
      return result as U
    },
    iterable,
  )
  return result as AsyncIterable<U>
}

/**
 * Transform an iterable with a function.
 */
/*@__NO_SIDE_EFFECTS__*/
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
      const result = await pRetry((...args: unknown[]) => func(args[0] as T), {
        ...opts.retries,
        args: [item],
      })
      return result as U
    },
    iterable,
  )
  return result as AsyncIterable<U>
}
