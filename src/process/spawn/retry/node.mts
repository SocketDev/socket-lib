/**
 * @file The Node retry variant: a real blocking wait between attempts.
 *   `Atomics.wait` blocks the calling thread without spinning the CPU, and
 *   Node permits it on the main thread. Browsers do not, which is what
 *   `./browser` exists for.
 */

import { AtomicsWait, Int32ArrayCtor } from '../../../primordials/array.mjs'
import { SharedArrayBufferCtor } from '../../../primordials/globals.mjs'

import { runWithSpawnRetryUsing } from './policy.mjs'

import type { SpawnRetryFailure, SpawnRetryOptions } from './policy.mjs'

export * from './policy.mjs'

/**
 * Whether a blocking wait is available here.
 *
 * Node always defines `SharedArrayBuffer`, so this is true for every runtime
 * that can reach `spawnSync`. It is false in V8's `--build-snapshot` builder,
 * where the global is absent.
 */
export function canSleepSync(): boolean {
  return SharedArrayBufferCtor !== undefined
}

/**
 * Run `attempt` under the retry policy, waiting between tries.
 */
export function runWithSpawnRetry<Result extends SpawnRetryFailure>(
  attempt: () => Result,
  options?: SpawnRetryOptions | undefined,
): Result {
  return runWithSpawnRetryUsing(sleepSync, attempt, options)
}

/**
 * Block the calling thread for `ms`. Returns whether the wait happened.
 *
 * The `try` is not defensive padding. `Atomics.wait` throws a `TypeError` on a
 * thread that may not block, and a cross-origin-isolated browser main thread
 * DEFINES `SharedArrayBuffer` while still forbidding the wait. Testing the
 * global alone therefore passes and then throws. Reporting false there keeps
 * the contract: no wait means the caller makes one attempt.
 */
export function sleepSync(ms: number): boolean {
  if (SharedArrayBufferCtor === undefined) {
    return false
  }
  if (ms <= 0) {
    return true
  }
  try {
    AtomicsWait(new Int32ArrayCtor(new SharedArrayBufferCtor(4)), 0, 0, ms)
  } catch {
    return false
  }
  return true
}
