/**
 * @fileoverview Smoke test for the Temporal surface.
 *
 * Conformance is owned by the test262 runner at
 * `scripts/test262/temporal.mts`. This test exists only to prove that
 * the public surface is reachable, that `import * as Temporal` yields
 * the expected namespace shape, and that the end-to-end smoke path
 * (Now.instant → epochNanoseconds getter) returns a sane value
 * without throwing. If this single test fails, every test262 case
 * will fail too — catching it here with a single clear assertion
 * beats decoding thousands of misleading test262 errors.
 */

import { describe, expect, it } from 'vitest'

import * as Temporal from '../../src/temporal/temporal'

describe('Temporal smoke', () => {
  it('exposes the surface and round-trips Now.instant → epochNanoseconds', () => {
    // Surface present.
    expect(typeof Temporal.Now.instant).toBe('function')
    expect(typeof Temporal.Instant).toBe('function')

    // End-to-end smoke: read the wallclock, observe nanoseconds.
    const instant = Temporal.Now.instant()
    const ns = instant.epochNanoseconds

    // Type + sanity check: bigint, post-2020, pre-2100.
    expect(typeof ns).toBe('bigint')
    expect(ns).toBeGreaterThan(1_577_836_800_000_000_000n)
    expect(ns).toBeLessThan(4_102_444_800_000_000_000n)
  })
})
