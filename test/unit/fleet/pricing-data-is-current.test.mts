// vitest specs for the pricing-data staleness check
// (scripts/fleet/check/pricing-data-is-current.mts): the snapshot-marker parse
// and the whole-day age math that decide when the model-pricing data is stale.

import assert from 'node:assert/strict'

import { test } from 'vitest'

import {
  daysBetween,
  parseSnapshotDate,
} from '../../../scripts/fleet/check/pricing-data-is-current.mts'

// ── parseSnapshotDate ───────────────────────────────────────────

test('parseSnapshotDate reads the ISO date from the marker comment', () => {
  const date = parseSnapshotDate(
    '<!-- MODEL-PRICING-SNAPSHOT: 2026-06-11 -- anchor -->',
  )
  assert.equal(date?.toISOString().slice(0, 10), '2026-06-11')
})

test('parseSnapshotDate finds the marker amid surrounding prose', () => {
  const doc = [
    '# Skill model routing',
    'some prose',
    '<!-- MODEL-PRICING-SNAPSHOT: 2025-12-01 -- note -->',
    'more prose',
  ].join('\n')
  assert.equal(parseSnapshotDate(doc)?.toISOString().slice(0, 10), '2025-12-01')
})

test('parseSnapshotDate returns undefined when the marker is absent', () => {
  assert.equal(parseSnapshotDate('no marker in here'), undefined)
})

test('parseSnapshotDate returns undefined for an unparseable date', () => {
  // Month 99 is not a real date — Date parses it as NaN.
  assert.equal(
    parseSnapshotDate('<!-- MODEL-PRICING-SNAPSHOT: 2026-99-99 -->'),
    undefined,
  )
})

// ── daysBetween ─────────────────────────────────────────────────

test('daysBetween counts whole days forward', () => {
  const a = new Date('2026-06-01T00:00:00Z')
  const b = new Date('2026-06-11T00:00:00Z')
  assert.equal(daysBetween(a, b), 10)
})

test('daysBetween is zero for the same day', () => {
  const a = new Date('2026-06-11T00:00:00Z')
  assert.equal(daysBetween(a, a), 0)
})

test('daysBetween crosses the 35-day freshness window', () => {
  const snapshot = new Date('2026-04-01T00:00:00Z')
  const now = new Date('2026-06-11T00:00:00Z')
  // 71 days — past the 35-day window, so the check would remind.
  assert.equal(daysBetween(snapshot, now), 71)
})
