/**
 * @file Spec clause 21.x host hook — wallclock reader. Implements
 *   `SystemUTCEpochNanoseconds()`, the spec's nanosecond- resolution wallclock
 *   read. Hosts may use any source they like provided the result is
 *   non-decreasing across calls. On Node we combine `Date.now()` (millisecond
 *   wallclock) with `process.hrtime.bigint()` (sub-millisecond monotonic
 *   counter) anchored at module load to deliver real nanosecond resolution.
 *   Fallback path (non-Node hosts without `process.hrtime.bigint`): we multiply
 *   `Date.now()` by 1_000_000n to fill the field with zeros. This trades
 *   sub-millisecond precision for portability and is the same compromise the
 *   polyfill makes for browser hosts. Spec:
 *   https://tc39.es/proposal-temporal/#sec-temporal-systemutcepochnanoseconds.
 */

import { BigIntCtor } from '../primordials/globals'
import { DateNow } from '../primordials/date'

// ─────────────────────────────────────────────────────────────────
// Anchors captured at module load
// ─────────────────────────────────────────────────────────────────
//
// The wallclock at `_anchorWallMs` corresponds to the monotonic
// counter value `_anchorHrns`. Subsequent reads compute the elapsed
// monotonic nanoseconds and add them to the captured wallclock.
//
// Drift caveat: NTP adjustments after capture will not be reflected.
// For our usage (soak-window comparisons measured in days) the drift
// is bounded by ±ppm × process-uptime — sub-second over weeks.
// Acceptable.

const _hrtimeBigint: (() => bigint) | undefined = (
  globalThis as {
    process?:
      | { hrtime?: { bigint?: (() => bigint) | undefined } | undefined }
      | undefined
  }
).process?.hrtime?.bigint

const _anchorWallMs: bigint = BigIntCtor(DateNow())
const _anchorHrns: bigint = _hrtimeBigint ? _hrtimeBigint() : 0n
const _NS_PER_MS = 1_000_000n

// ─────────────────────────────────────────────────────────────────
// 21.x SystemUTCEpochNanoseconds ( )
// https://tc39.es/proposal-temporal/#sec-temporal-systemutcepochnanoseconds
//
// 1. Let ns be the approximate current UTC date and time, in
//    nanoseconds since the epoch.
// 2. Set ns to the result of clamping ns between nsMinInstant and
//    nsMaxInstant.
// 3. Return ℤ(ns).
//
// Range clamping at step 2 is enforced upstream by
// `IsValidEpochNanoseconds` in `instant.ts` when an Instant is
// constructed from the return value — the host hook itself returns
// the raw read, since wallclocks in the supported host range cannot
// produce out-of-range values.
// ─────────────────────────────────────────────────────────────────

/**
 * Returns the current UTC time as nanoseconds since 1970-01-01T00:00:00Z.
 *
 * Resolution is nanosecond on Node (via `process.hrtime.bigint` anchored at
 * module load), millisecond elsewhere.
 */
export function systemUTCEpochNanoseconds(): bigint {
  // Step 1.
  if (_hrtimeBigint) {
    const elapsedNs = _hrtimeBigint() - _anchorHrns
    return _anchorWallMs * _NS_PER_MS + elapsedNs
  }
  /* c8 ignore next - Non-Node runtime fallback; tests always run under Node
     where _hrtimeBigint is bound from process.hrtime.bigint. */
  return BigIntCtor(DateNow()) * _NS_PER_MS

  // Step 2 is deferred to IsValidEpochNanoseconds upstream.
  // Step 3 is implicit — the return type is already BigInt (ℤ).
}
