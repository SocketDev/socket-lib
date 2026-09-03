/**
 * @file Unit tests for src/constants/units.
 *   Every expectation is a HARD-CODED literal, never a re-composition of the
 *   constants under test. `expect(DAY).toBe(24 * HR)` passes even when both
 *   sides carry the same wrong divisor, which is the one mistake these
 *   constants exist to prevent.
 */

import { describe, expect, it } from 'vitest'

// The subject is the source, not the published alias: a unit test that reads
// `-stable` measures the last release rather than the code in this checkout.
// oxlint-disable-next-line socket/no-src-import-in-test-expect -- src IS the subject
import {
  DAY,
  GB,
  HR,
  KB,
  MB,
  MIN,
  MONTH,
  SEC,
  TB,
  WEEK,
  YEAR,
} from '../../../src/constants/units.mjs'

describe('duration units', () => {
  it('holds the millisecond value of each unit', () => {
    expect(SEC).toBe(1000)
    expect(MIN).toBe(60_000)
    expect(HR).toBe(3_600_000)
    expect(DAY).toBe(86_400_000)
    expect(WEEK).toBe(604_800_000)
  })

  it('holds the calendar-average month and year', () => {
    // 30.436875 days and 365.25 days, the Gregorian averages.
    expect(MONTH).toBe(2_629_746_000)
    expect(YEAR).toBe(31_557_600_000)
  })

  it('every duration is a whole number of milliseconds', () => {
    for (const ms of [SEC, MIN, HR, DAY, WEEK, MONTH, YEAR]) {
      expect(Number.isInteger(ms)).toBe(true)
    }
  })
})

describe('byte units', () => {
  it('holds the binary value of each size', () => {
    expect(KB).toBe(1024)
    expect(MB).toBe(1_048_576)
    expect(GB).toBe(1_073_741_824)
    expect(TB).toBe(1_099_511_627_776)
  })

  it('sizes are binary, not decimal', () => {
    expect(MB).not.toBe(1_000_000)
    expect(GB).not.toBe(1_000_000_000)
  })
})
