/**
 * @file Concurrency-controlled async iteration helpers: `pEach`, `pEachChunk`,
 *   `pFilter`, `pFilterChunk`. All four use `pRetry` internally so each item's
 *   callback can be retried independently without affecting siblings. The chunk
 *   vs. concurrency distinction:
 *
 *   - `pEach` / `pFilter` use a **concurrency limit**: split the input into
 *     chunks of size `concurrency`, process each chunk in parallel, then move
 *     on to the next chunk.
 *   - `pEachChunk` / `pFilterChunk` operate on **pre-chunked input**: the caller
 *     decides chunk boundaries (e.g., bulk-insert batch size, pagination page
 *     size). Useful when chunk size != concurrency cap.
 */

import { arrayChunk } from '../arrays/chunk'
import { PromiseAllSettled } from '../primordials/promise'
import { normalizeIterationOptions, normalizeRetryOptions } from './options'
import { pRetry } from './retry'

import type { IterationOptions, RetryOptions } from './types'

/**
 * Execute an async function for each array element with concurrency control.
 *
 * Processes array items in parallel batches (chunks) with configurable
 * concurrency. Each item's callback can be retried independently on failure.
 * Similar to `Promise.all(array.map(fn))` but with controlled parallelism.
 *
 * @example
 *   // Process items serially (concurrency: 1)
 *   await pEach(urls, async url => {
 *     await fetch(url)
 *   })
 *
 * @example
 *   // Process 5 items at a time
 *   await pEach(
 *     files,
 *     async file => {
 *       await processFile(file)
 *     },
 *     5,
 *   )
 *
 * @example
 *   // With retries and cancellation
 *   const controller = new AbortController()
 *   await pEach(
 *     tasks,
 *     async task => {
 *       await executeTask(task)
 *     },
 *     {
 *       concurrency: 3,
 *       retries: 2,
 *       signal: controller.signal,
 *     },
 *   )
 *
 * @template T - The type of array elements.
 *
 * @param array - The array to iterate over.
 * @param callbackFn - Async function to execute for each item.
 * @param options - Concurrency as number, or full iteration options, or
 *   undefined.
 *
 * @returns Promise that resolves when all items are processed
 */
export async function pEach<T>(
  array: T[],
  callbackFn: (item: T) => Promise<unknown>,
  options?: number | IterationOptions | undefined,
): Promise<void> {
  const iterOpts = normalizeIterationOptions(options)
  const { concurrency, retries, signal } = iterOpts

  // Process items with concurrency control.
  const chunks = arrayChunk(array, concurrency)
  for (const chunk of chunks) {
    if (signal?.aborted) {
      return
    }
    // Process each item in the chunk concurrently.
    // eslint-disable-next-line no-await-in-loop
    await PromiseAllSettled(
      chunk.map((item: T) =>
        pRetry((...args: unknown[]) => callbackFn(args[0] as T), {
          ...retries,
          args: [item],
          signal,
        }),
      ),
    )
  }
}

/**
 * Process array in chunks with an async callback.
 *
 * Divides the array into fixed-size chunks and processes each chunk
 * sequentially with the callback. Useful for batch operations like bulk
 * database inserts or API calls with payload size limits.
 *
 * @example
 *   // Insert records in batches of 100
 *   await pEachChunk(
 *     records,
 *     async chunk => {
 *       await db.batchInsert(chunk)
 *     },
 *     { chunkSize: 100 },
 *   )
 *
 * @example
 *   // Upload files in batches with retries
 *   await pEachChunk(
 *     files,
 *     async batch => {
 *       await uploadBatch(batch)
 *     },
 *     {
 *       chunkSize: 50,
 *       retries: 3,
 *       baseDelayMs: 1000,
 *     },
 *   )
 *
 * @example
 *   // Process with cancellation support
 *   const controller = new AbortController()
 *   await pEachChunk(
 *     items,
 *     async chunk => {
 *       await processChunk(chunk)
 *     },
 *     {
 *       chunkSize: 25,
 *       signal: controller.signal,
 *     },
 *   )
 *
 * @template T - The type of array elements.
 *
 * @param array - The array to process in chunks.
 * @param callbackFn - Async function to execute for each chunk.
 * @param options - Chunk size and retry options.
 *
 * @returns Promise that resolves when all chunks are processed
 */
export async function pEachChunk<T>(
  array: T[],
  callbackFn: (chunk: T[]) => Promise<unknown>,
  options?: (RetryOptions & { chunkSize?: number | undefined }) | undefined,
): Promise<void> {
  const { chunkSize = 100, ...retryOpts } = options || {}
  const chunks = arrayChunk(array, chunkSize)
  const normalizedRetryOpts = normalizeRetryOptions(retryOpts)
  const { signal } = normalizedRetryOpts
  for (const chunk of chunks) {
    if (signal?.aborted) {
      return
    }
    // eslint-disable-next-line no-await-in-loop
    await pRetry((...args: unknown[]) => callbackFn(args[0] as T[]), {
      ...normalizedRetryOpts,
      args: [chunk],
    })
  }
}

/**
 * Filter an array asynchronously with concurrency control.
 *
 * Tests each element with an async predicate function, processing items in
 * parallel batches. Returns a new array with only items that pass the test.
 * Similar to `array.filter()` but for async predicates with controlled
 * concurrency.
 *
 * @example
 *   // Filter serially
 *   const activeUsers = await pFilter(users, async user => {
 *     return await isUserActive(user.id)
 *   })
 *
 * @example
 *   // Filter with concurrency
 *   const validFiles = await pFilter(
 *     filePaths,
 *     async path => {
 *       return existsSync(path)
 *     },
 *     10,
 *   )
 *
 * @example
 *   // With retries for flaky checks
 *   const reachable = await pFilter(
 *     endpoints,
 *     async url => {
 *       const response = await fetch(url)
 *       return response.ok
 *     },
 *     {
 *       concurrency: 5,
 *       retries: 2,
 *     },
 *   )
 *
 * @template T - The type of array elements.
 *
 * @param array - The array to filter.
 * @param callbackFn - Async predicate function returning true to keep item.
 * @param options - Concurrency as number, or full iteration options, or
 *   undefined.
 *
 * @returns Promise resolving to filtered array
 */
export async function pFilter<T>(
  array: T[],
  callbackFn: (item: T) => Promise<boolean>,
  options?: number | IterationOptions | undefined,
): Promise<T[]> {
  const iterOpts = normalizeIterationOptions(options)
  return (
    await pFilterChunk(
      arrayChunk(array, iterOpts.concurrency),
      callbackFn,
      iterOpts.retries,
    )
  ).flat()
}

/**
 * Filter chunked arrays with an async predicate.
 *
 * Internal helper for `pFilter`. Processes pre-chunked arrays, applying the
 * predicate to each element within each chunk with retry support.
 *
 * @example
 *   const chunks = [
 *     [1, 2],
 *     [3, 4],
 *     [5, 6],
 *   ]
 *   const filtered = await pFilterChunk(chunks, async n => n % 2 === 0)
 *   // => [[2], [4], [6]]
 *
 * @template T - The type of array elements.
 *
 * @param chunks - Pre-chunked array (array of arrays)
 * @param callbackFn - Async predicate function.
 * @param options - Retry count as number, or full retry options, or undefined.
 *
 * @returns Promise resolving to array of filtered chunks
 */
export async function pFilterChunk<T>(
  chunks: T[][],
  callbackFn: (value: T) => Promise<boolean>,
  options?: number | RetryOptions | undefined,
): Promise<T[][]> {
  const retryOpts = normalizeRetryOptions(options)
  const { signal } = retryOpts
  const { length } = chunks
  const filteredChunks = Array(length)
  for (let i = 0; i < length; i += 1) {
    // Process each chunk, filtering based on the callback function.
    if (signal?.aborted) {
      filteredChunks[i] = []
    } else {
      const chunk = chunks[i] as T[]
      // eslint-disable-next-line no-await-in-loop
      const settled = await PromiseAllSettled(
        chunk.map(value =>
          pRetry((...args: unknown[]) => callbackFn(args[0] as T), {
            ...retryOpts,
            args: [value],
          }),
        ),
      )
      const predicateResults = settled.map(r =>
        r.status === 'fulfilled' ? r.value : false,
      )
      filteredChunks[i] = chunk.filter((_value, index) => predicateResults[index])
    }
  }
  return filteredChunks
}
