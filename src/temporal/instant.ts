/**
 * @file Spec clause 8 — Temporal.Instant Objects. Implements the class,
 *   constructor, and the validity predicate. Pass 1 of the rollout; statics
 *   (`from`, `fromEpochMilliseconds`, `compare`) and prototype operations
 *   (`epochMilliseconds`, `toString`, arithmetic) follow in pass 2. Spec:
 *   https://tc39.es/proposal-temporal/#sec-temporal-instant-objects Ref:
 *   js-temporal/temporal-polyfill `lib/instant.ts` Operations implemented (✓)
 *   and intentionally absent (✗), in section order so a reader can scan against
 *   the spec: ✓ 8.1.1 Temporal.Instant ( epochNanoseconds ) — constructor ✓
 *   8.1.1.x IsValidEpochNanoseconds ( epochNanoseconds ) — abstract op ✓ 8.5.6
 *   get Temporal.Instant.prototype.epochNanoseconds — prototype ✗ 8.4.2
 *   Temporal.Instant.from ( item ) — pass 2 ✗ 8.4.3
 *   Temporal.Instant.fromEpochMilliseconds ( ms ) — pass 2 ✗ 8.4.7
 *   Temporal.Instant.compare ( one, two ) — pass 2 ✗ 8.5.5 get
 *   Temporal.Instant.prototype.epochMilliseconds — pass 2 ✗ 8.5.13
 *   Temporal.Instant.prototype.toString ( [ options ] ) — pass 2 ✗ 8.5.x add /
 *   subtract / until / since / round / equals / etc. — later.
 */

import { BigIntCtor } from '../primordials/globals'
import { RangeErrorCtor, TypeErrorCtor } from '../primordials/error'

import { getInstantNanoseconds, hasInstantSlot, setInstantSlots } from './slots'

import { JSONStringify } from '../primordials/json'

import { ObjectDefineProperty } from '../primordials/object'

// ─────────────────────────────────────────────────────────────────
// 8.1.1.x IsValidEpochNanoseconds ( epochNanoseconds )
// https://tc39.es/proposal-temporal/#sec-temporal-isvalidepochnanoseconds
//
// 1. If epochNanoseconds < nsMinInstant or epochNanoseconds >
//    nsMaxInstant, then
//    a. Return false.
// 2. Return true.
//
// nsMinInstant = -86_40000_00000_00000_00000n   (= -1e8 days × 86400e9 ns/day)
// nsMaxInstant =  86_40000_00000_00000_00000n
//
// ±100 million days from epoch; the spec's hard limit on
// representable Instants.
// ─────────────────────────────────────────────────────────────────

const NS_MAX_INSTANT = 8_640_000_000_000_000_000_000n
const NS_MIN_INSTANT = -NS_MAX_INSTANT

/**
 * Spec's IsValidEpochNanoseconds. Exported for testability.
 */
export function isValidEpochNanoseconds(epochNanoseconds: bigint): boolean {
  // Step 1.
  if (epochNanoseconds < NS_MIN_INSTANT || epochNanoseconds > NS_MAX_INSTANT) {
    // Step 1.a.
    return false
  }
  // Step 2.
  return true
}

// ─────────────────────────────────────────────────────────────────
// 8.1.1 Temporal.Instant ( epochNanoseconds )
// https://tc39.es/proposal-temporal/#sec-temporal-instant-constructor
//
// 1. If NewTarget is undefined, throw a TypeError exception.
// 2. Set epochNanoseconds to ? ToBigInt(epochNanoseconds).
// 3. If ! IsValidEpochNanoseconds(epochNanoseconds) is false, throw a
//    RangeError exception.
// 4. Return ? CreateTemporalInstant(epochNanoseconds, NewTarget).
//
// Step 1 is enforced by the JS runtime — calling a class without
// `new` is a TypeError before this body runs. The check is preserved
// in the annotation for spec fidelity.
//
// CreateTemporalInstant (step 4) is inlined here: it is the only
// call site within clause 8 that doesn't bounce through this
// constructor anyway.
// ─────────────────────────────────────────────────────────────────

/**
 * Temporal.Instant — an exact, nanosecond-resolution point on the UTC timeline.
 * Backed by a `bigint` `[[Nanoseconds]]` slot in the range ±8.64e21 (±100
 * million days from the Unix epoch).
 *
 * Construct via `new Temporal.Instant(epochNanoseconds)` or, in pass 2, the
 * various `from*` statics.
 */
export class Instant {
  // Prototype getter installed at module load via Object.defineProperty
  // (see below — keeps the spec-step body and the wiring co-located).
  // Declared on the class so consumers can read `instant.epochNanoseconds`
  // with full type information.
  declare readonly epochNanoseconds: bigint

  constructor(epochNanoseconds: bigint | number | string) {
    // Step 1 — enforced by runtime; reaching this body implies `new`.

    // Step 2.
    let ns: bigint
    try {
      ns = BigIntCtor(epochNanoseconds as bigint)
    } catch {
      throw new TypeErrorCtor(
        `Temporal.Instant: epochNanoseconds must be coercible to BigInt; ` +
          `saw ${describe(epochNanoseconds)}. Pass a bigint literal ` +
          `(e.g. 1700000000000000000n) or a numeric string.`,
      )
    }

    // Step 3.
    if (!isValidEpochNanoseconds(ns)) {
      throw new RangeErrorCtor(
        `Temporal.Instant: epochNanoseconds out of range; ` +
          `saw ${ns}n. Must be in [-8.64e21, 8.64e21] ` +
          `(±100,000,000 days from 1970-01-01T00:00:00Z).`,
      )
    }

    // Step 4 — CreateTemporalInstant inlined.
    setInstantSlots(this, ns)
  }
}

// ─────────────────────────────────────────────────────────────────
// 8.5 Properties of the Temporal.Instant Prototype Object
// https://tc39.es/proposal-temporal/#sec-properties-of-the-temporal-instant-prototype-object
// ─────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────
// 8.5.6 get Temporal.Instant.prototype.epochNanoseconds
// https://tc39.es/proposal-temporal/#sec-get-temporal.instant.prototype.epochnanoseconds
//
// 1. Let instant be the this value.
// 2. Perform ? RequireInternalSlot(instant, [[InitializedTemporalInstant]]).
// 3. Let ns be instant.[[Nanoseconds]].
// 4. Return ns.
// ─────────────────────────────────────────────────────────────────

// oxlint-disable-next-line socket/sort-source-methods -- ordered by TC39 Temporal clause number (8.5.6), not alphabetically, so the file reads alongside the spec. See README.md "Adding a new operation".
export function epochNanosecondsImpl(this: Instant): bigint {
  // Step 1. Spec: "Let instant be the this value." Keeping `instant`
  // as a named local preserves the step-for-step mapping the rest of
  // this folder follows.
  // oxlint-disable-next-line typescript-eslint/no-this-alias -- spec step-for-step mapping requires named `instant` local
  const instant = this
  // Step 2.
  if (!hasInstantSlot(instant)) {
    throw new TypeErrorCtor(
      `Temporal.Instant.prototype.epochNanoseconds: receiver lacks ` +
        `[[InitializedTemporalInstant]] internal slot; ` +
        `saw ${describe(instant)}. Call on a Temporal.Instant ` +
        `instance constructed via 'new Temporal.Instant(…)'.`,
    )
  }
  // Step 3.
  const ns = getInstantNanoseconds(instant)
  // Step 4.
  return ns
}

ObjectDefineProperty(Instant.prototype, 'epochNanoseconds', {
  get: epochNanosecondsImpl,
  configurable: true,
})

// ─────────────────────────────────────────────────────────────────
// Local helpers
// ─────────────────────────────────────────────────────────────────

/**
 * One-line description of an arbitrary value for error messages.
 */
// oxlint-disable-next-line socket/sort-source-methods -- local error-message helper kept in the trailing "Local helpers" section after the spec operations that consume it, not in alphabetical order. See README.md "Adding a new operation".
export function describe(value: unknown): string {
  if (value === null) {
    return 'null'
  }
  if (typeof value === 'bigint') {
    return `${value}n`
  }
  if (typeof value === 'object') {
    const ctor = (
      value as { constructor?: { name?: string | undefined } | undefined }
    ).constructor
    return ctor?.name ? `<${ctor.name}>` : '<object>'
  }
  return typeof value === 'string' ? JSONStringify(value) : String(value)
}
