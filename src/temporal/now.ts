/**
 * @file Spec clause 6 — Temporal.Now. The `Temporal.Now` namespace exposes
 *   host-reading operations that return live wallclock state. Pass 1 ships
 *   `instant()`; the other `Now.*` operations (`timeZoneId`,
 *   `plainDateTimeISO`, …) land when a caller needs them. Spec:
 *   https://tc39.es/proposal-temporal/#sec-temporal-now-object Ref:
 *   js-temporal/temporal-polyfill `lib/now.ts` Operations implemented (✓) and
 *   intentionally absent (✗), in section order: ✓ 6.3.3 Temporal.Now.instant (
 *   ) ✗ 6.3.4 Temporal.Now.timeZoneId ( ) ✗ 6.3.5 Temporal.Now.zonedDateTime (
 *   calendar [ , temporalTimeZoneLike ] ) ✗ 6.3.6 Temporal.Now.zonedDateTimeISO
 *   ( [ temporalTimeZoneLike ] ) ✗ 6.3.7 Temporal.Now.plainDateTime ( calendar
 *   [ , temporalTimeZoneLike ] ) ✗ 6.3.8 Temporal.Now.plainDateTimeISO ( [
 *   temporalTimeZoneLike ] ) ✗ 6.3.9 Temporal.Now.plainDate ( calendar [ ,
 *   temporalTimeZoneLike ] ) ✗ 6.3.10 Temporal.Now.plainDateISO ( [
 *   temporalTimeZoneLike ] ) ✗ 6.3.11 Temporal.Now.plainTimeISO ( [
 *   temporalTimeZoneLike ] )
 */

import { Instant } from './instant'
import { systemUTCEpochNanoseconds } from './system'

// ─────────────────────────────────────────────────────────────────
// 6.3.3 Temporal.Now.instant ( )
// https://tc39.es/proposal-temporal/#sec-temporal.now.instant
//
// 1. Return ! CreateTemporalInstant(SystemUTCEpochNanoseconds()).
//
// `!` denotes an abstract operation that the spec guarantees cannot
// abort. `SystemUTCEpochNanoseconds` returns a value within
// [nsMinInstant, nsMaxInstant] by definition on any conforming host,
// so the resulting Instant construction never throws.
// ─────────────────────────────────────────────────────────────────

/**
 * Returns a `Temporal.Instant` representing the current UTC time. Resolution is
 * nanosecond on Node, millisecond on hosts without `process.hrtime.bigint` (see
 * `system.ts`).
 */
export function instant(): Instant {
  // Step 1.
  return new Instant(systemUTCEpochNanoseconds())
}
