/**
 * @file Tests for the model-pricing reconciler's pure core: a refresh restamps
 *   the snapshot and merges sourced prices without dropping unpriced models or
 *   disturbing the multipliers, and the routing-doc marker restamp is a precise
 *   in-place edit.
 */

import { describe, expect, test } from 'vitest'

import type { PricingData } from '../../../scripts/fleet/estimate-ai-cost.mts'
import {
  applyPricingUpdate,
  readSourcedPrices,
  restampDocMarker,
} from '../../../scripts/fleet/update-model-pricing.mts'

const CURRENT: PricingData = {
  models: {
    'claude-haiku-4-5': { inputPerMtok: 1.0, outputPerMtok: 5.0 },
    'claude-opus-4-8': { inputPerMtok: 5.0, outputPerMtok: 25.0 },
  },
  multipliers: { batch: 0.5, cacheRead: 0.1 },
  snapshot: '2026-06-14',
  source: 'https://platform.claude.com/docs/en/about-claude/pricing',
}

describe('applyPricingUpdate', () => {
  test('restamps the snapshot to the given date', () => {
    const next = applyPricingUpdate(CURRENT, { date: '2026-07-01', prices: {} })
    expect(next.snapshot).toBe('2026-07-01')
  })

  test('merges sourced prices over the current rates', () => {
    const next = applyPricingUpdate(CURRENT, {
      date: '2026-07-01',
      prices: { 'claude-opus-4-8': { inputPerMtok: 6, outputPerMtok: 30 } },
    })
    expect(next.models['claude-opus-4-8']).toEqual({
      inputPerMtok: 6,
      outputPerMtok: 30,
    })
  })

  test('a partial refresh keeps unpriced models, never drops them', () => {
    const next = applyPricingUpdate(CURRENT, {
      date: '2026-07-01',
      prices: { 'claude-opus-4-8': { inputPerMtok: 6, outputPerMtok: 30 } },
    })
    expect(next.models['claude-haiku-4-5']).toEqual(
      CURRENT.models['claude-haiku-4-5'],
    )
    expect(Object.keys(next.models)).toHaveLength(2)
  })

  test('leaves the multipliers untouched', () => {
    const next = applyPricingUpdate(CURRENT, { date: '2026-07-01', prices: {} })
    expect(next.multipliers).toEqual(CURRENT.multipliers)
  })

  test('--source overrides the recorded source when given', () => {
    const next = applyPricingUpdate(CURRENT, {
      date: '2026-07-01',
      prices: {},
      source: 'https://example.com/prices',
    })
    expect(next.source).toBe('https://example.com/prices')
  })

  test('keeps the current source when none is given', () => {
    const next = applyPricingUpdate(CURRENT, { date: '2026-07-01', prices: {} })
    expect(next.source).toBe(CURRENT.source)
  })
})

describe('restampDocMarker', () => {
  test('rewrites the snapshot marker date in place, keeping the note', () => {
    const doc =
      'x <!-- MODEL-PRICING-SNAPSHOT: 2026-06-11 -- machine anchor --> y'
    const out = restampDocMarker(doc, '2026-07-01')
    expect(out).toContain('MODEL-PRICING-SNAPSHOT: 2026-07-01')
    expect(out).toContain('-- machine anchor --')
  })

  test('leaves text without the marker unchanged', () => {
    expect(restampDocMarker('no marker here', '2026-07-01')).toBe(
      'no marker here',
    )
  })
})

describe('readSourcedPrices', () => {
  test('reads prices from the --prices flag', () => {
    const prices = readSourcedPrices(
      ['--prices', '{"x":{"inputPerMtok":1,"outputPerMtok":2}}'],
      '',
    )
    expect(prices['x']).toEqual({ inputPerMtok: 1, outputPerMtok: 2 })
  })

  test('falls back to stdin when --prices is absent', () => {
    const prices = readSourcedPrices(
      [],
      '{"y":{"inputPerMtok":3,"outputPerMtok":4}}',
    )
    expect(prices['y']).toEqual({ inputPerMtok: 3, outputPerMtok: 4 })
  })

  test('returns empty when neither flag nor stdin supplies prices', () => {
    expect(Object.keys(readSourcedPrices([], ''))).toHaveLength(0)
  })
})
