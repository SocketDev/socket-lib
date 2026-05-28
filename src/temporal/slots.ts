/**
 * @file Internal-slot machinery for Temporal objects. The TC39 Temporal spec
 *   models per-object state as non-introspectable internal slots —
 *   `[[InitializedTemporalInstant]]`, `[[Nanoseconds]]`,
 *   `[[InitializedTemporalDuration]]`, etc. Slots are not observable via
 *   property access, `Reflect`, or iteration. Slot presence is the spec's
 *   identity check, distinct from `instanceof` (which coincides on
 *   freshly-constructed instances but diverges under
 *   `Object.create(C.prototype)`, where instanceof passes but slots are
 *   absent). One `WeakMap` per slot, or `WeakSet` for boolean presence.
 *   Receiver is the key. `WeakMap` semantics keep slot storage out of the GC
 *   graph, matching the spec's "internal slot" wording. Spec reference:
 *   https://tc39.es/proposal-temporal/ — search for
 *   `[[InitializedTemporalInstant]]` and `RequireInternalSlot`. Reference impl:
 *   js-temporal/temporal-polyfill `lib/slots.ts` (pinned commit in README.md).
 */

import { WeakMapCtor, WeakSetCtor } from '../primordials/map-set'

// ─────────────────────────────────────────────────────────────────
// Temporal.Instant slots
// https://tc39.es/proposal-temporal/#sec-properties-of-temporal-instant-instances
//
// Every Temporal.Instant instance has:
//   [[InitializedTemporalInstant]] — presence sentinel
//   [[Nanoseconds]]                — BigInt nanoseconds since
//                                    1970-01-01T00:00:00Z; integral
// ─────────────────────────────────────────────────────────────────

const _initializedInstant = new WeakSetCtor<object>()
const _instantNanoseconds = new WeakMapCtor<object, bigint>()

/**
 * Read `[[Nanoseconds]]`. Caller MUST gate on `hasInstantSlot` first; behaviour
 * on absent-slot input is undefined.
 */
export function getInstantNanoseconds(o: object): bigint {
  return _instantNanoseconds.get(o)!
}

/**
 * Spec's `RequireInternalSlot(O, [[InitializedTemporalInstant]])` predicate.
 * Returns false for non-object inputs.
 */
export function hasInstantSlot(o: unknown): o is object {
  return typeof o === 'object' && o !== null && _initializedInstant.has(o)
}

/**
 * Install `[[InitializedTemporalInstant]]` and `[[Nanoseconds]]` on a receiver.
 * Caller is responsible for range-validating `nanoseconds` against
 * `IsValidEpochNanoseconds` first; this function does not.
 */
export function setInstantSlots(o: object, nanoseconds: bigint): void {
  _initializedInstant.add(o)
  _instantNanoseconds.set(o, nanoseconds)
}
