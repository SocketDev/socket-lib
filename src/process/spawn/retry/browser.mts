/**
 * @file The browser retry variant: no blocking wait, so no retry.
 *   A browser main thread cannot block. `Atomics.wait` throws a `TypeError`
 *   there even when `SharedArrayBuffer` exists, which it does under
 *   cross-origin isolation, so testing for the global is not enough.
 *   NOTHING SIMULATES A BLOCKING SLEEP ON THAT THREAD. A `Date.now()` spin
 *   blocks, but burns a core and freezes the frame loop for the whole delay,
 *   so a 30-second ceiling hangs the tab. `Atomics.waitAsync` does not block
 *   by design: it returns a promise, so it cannot serve a synchronous caller.
 *   A synchronous `XMLHttpRequest` blocks, needs the network, and browsers are
 *   removing it. Each of those fails worse than not waiting at all.
 *   So this variant reports that it cannot wait, and the shared policy makes
 *   exactly one attempt. Retrying with no pacing is a hot loop against
 *   whatever already failed.
 *   A worker thread is the exception, because `Atomics.wait` is legal there.
 *   Code that wants a paced retry in a browser belongs in a worker, on the
 *   Node variant's approach rather than this one.
 */

import { runWithSpawnRetryUsing } from './policy.mjs'

import type { SpawnRetryFailure, SpawnRetryOptions } from './policy.mjs'

export * from './policy.mjs'

/**
 * Always false: a browser main thread may not block.
 */
export function canSleepSync(): boolean {
  return false
}

/**
 * Run `attempt` under the retry policy. With no wait available this makes one
 * attempt, whatever `retries` says.
 */
export function runWithSpawnRetry<Result extends SpawnRetryFailure>(
  attempt: () => Result,
  options?: SpawnRetryOptions | undefined,
): Result {
  return runWithSpawnRetryUsing(sleepSync, attempt, options)
}

/**
 * Always false, and never waits. See the file header for why no browser
 * main-thread equivalent exists.
 */
export function sleepSync(ms: number): boolean {
  void ms
  return false
}
