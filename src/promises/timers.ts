/**
 * @file Browser-compatible promise-based timer helpers. Uses
 *   `globalThis.setTimeout` / `globalThis.queueMicrotask` directly so every
 *   export works in browsers, Node.js, Deno, Bun, and Web Workers without
 *   importing `node:timers/promises`. In Node.js test environments with
 *   `vi.useFakeTimers()` / `clock.install()`, vitest/sinon replace
 *   `globalThis.setTimeout` before this module loads, so fake timers advance
 *   `sleep()` correctly — no special wiring needed. For Node-only
 *   abort-signal-aware delays see `promises/_internal.ts`.
 */

import { PromiseCtor } from '../primordials/promise'

/**
 * Pause for `ms` milliseconds. Resolves with `undefined` when the timer fires.
 * Negative values are clamped to 0.
 *
 * @example
 *   await sleep(100)
 */
export function sleep(ms: number): Promise<void> {
  return new PromiseCtor<void>(resolve => {
    setTimeout(resolve, ms > 0 ? ms : 0)
  })
}

/**
 * Yield to the event loop once. Resolves after the current call stack and any
 * already-queued microtasks have completed — equivalent to `setTimeout(fn, 0)`
 * as described in
 * https://developer.mozilla.org/en-US/docs/Web/API/Window/setTimeout#late_timeouts.
 * Useful for flushing microtask queues in tests or giving the browser a repaint
 * opportunity between heavy operations.
 *
 * @example
 *   await yieldToEventLoop()
 */
export function yieldToEventLoop(): Promise<void> {
  return new PromiseCtor<void>(resolve => {
    setTimeout(resolve, 0)
  })
}
