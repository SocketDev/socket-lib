/**
 * @file Escalating-wait pacing for code that polls or retries against
 *   rate-limited services: a `createBackoff` state machine — initial delay,
 *   multiply per wait, optional cap, reset on forward progress. Unlike
 *   `pRetry`, which owns the whole retry loop, a `Backoff` is a passive
 *   pacing primitive the caller drives from its own loop.
 */

import { MathMin } from '../primordials/math.mjs'
import { NumberPOSITIVE_INFINITY } from '../primordials/number.mjs'
import { sleep } from './timers.mjs'

export interface BackoffOptions {
  factor?: number | undefined
  maxMs?: number | undefined
  sleeper?: ((ms: number) => Promise<void>) | undefined
}

export interface Backoff {
  currentMs(): number
  reset(): void
  wait(): Promise<void>
}

/**
 * Create an escalating-wait state machine starting at `ms`: `wait()` sleeps
 * the current delay, then multiplies it by `factor` (default 2) up to `maxMs`;
 * `reset()` returns to `ms` after forward progress. `sleeper` is injectable so
 * tests drive every wait with no real delay.
 *
 * @example
 *   ;```ts
 *   const backoff = createBackoff(1000, { maxMs: 30_000 })
 *   while (!(await poll())) {
 *     await backoff.wait() // 1s, 2s, 4s, … capped at 30s
 *   }
 *   backoff.reset() // forward progress: next wait() is 1s again
 *   ```
 *
 * @param ms - The initial delay in milliseconds.
 * @param options - Optional `factor`, `maxMs`, and injectable `sleeper`.
 *
 * @returns A `Backoff` pacing state machine.
 */
export function createBackoff(
  ms: number,
  options?: BackoffOptions | undefined,
): Backoff {
  const opts = { __proto__: null, ...options } as BackoffOptions
  const factor = opts.factor ?? 2
  const maxMs = opts.maxMs ?? NumberPOSITIVE_INFINITY
  // The default sleeper's timer must hold the event loop open: with an unref'd
  // timer, a process whose only pending work is a paced sleep drains the loop
  // and exits 0 mid-run — a silent false-green. `sleep` from promises/timers
  // uses a plain (ref'd) `setTimeout`, so it qualifies.
  const sleeper = opts.sleeper ?? sleep
  let delayMs = ms
  return {
    currentMs() {
      return delayMs
    },
    reset() {
      delayMs = ms
    },
    async wait() {
      await sleeper(delayMs)
      delayMs = MathMin(delayMs * factor, maxMs)
    },
  }
}
