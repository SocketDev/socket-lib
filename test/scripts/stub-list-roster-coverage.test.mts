/**
 * @file Unit tests for the stub list's roster-coverage record.
 *   The stub list is a claim about the WHOLE fleet: "no member imports this
 *   leaf, so it is safe to compile out". That claim is only as good as the set
 *   of consumers actually scanned, and the list historically stored the
 *   conclusion without the evidence — so a list computed against a smaller
 *   fleet was indistinguishable from a correct one. A leaf that only one member
 *   imports stayed stubbed after that member joined the roster, and shipped as
 *   a module that throws when that member calls it.
 *   These cover the pure comparison. The writer's own refusal (no stub list is
 *   written while a roster checkout is absent) is asserted separately, since it
 *   needs a filesystem.
 */

import { describe, expect, test } from 'vitest'

import { rosterCoverageGap } from '../../scripts/repo/build-stubs/unexposed.mts'

describe('rosterCoverageGap', () => {
  test('reports no gap when the recorded roster matches', () => {
    expect(rosterCoverageGap(['alpha', 'beta'], ['alpha', 'beta'])).toEqual({
      missing: [],
      stale: [],
    })
  })

  test('order does not matter', () => {
    expect(rosterCoverageGap(['beta', 'alpha'], ['alpha', 'beta'])).toEqual({
      missing: [],
      stale: [],
    })
  })

  test('catches a member the list was never judged against', () => {
    // The shape of the real incident: a member joins, the list predates it,
    // and every leaf only that member imports still reads as fleet-unused.
    expect(rosterCoverageGap(['alpha', 'beta'], ['alpha'])).toEqual({
      missing: ['beta'],
      stale: [],
    })
  })

  test('catches a departed member the list still records', () => {
    expect(rosterCoverageGap(['alpha'], ['alpha', 'gamma'])).toEqual({
      missing: [],
      stale: ['gamma'],
    })
  })

  test('reports both directions at once', () => {
    expect(rosterCoverageGap(['alpha', 'beta'], ['alpha', 'gamma'])).toEqual({
      missing: ['beta'],
      stale: ['gamma'],
    })
  })

  test('a list with NO recorded roster is fully uncovered, never a pass', () => {
    // The pre-record state. An empty record must read as "judged against
    // nothing", not as "nothing to check".
    expect(rosterCoverageGap(['alpha', 'beta'], [])).toEqual({
      missing: ['alpha', 'beta'],
      stale: [],
    })
  })

  test('sorts both lists so the message is stable', () => {
    const gap = rosterCoverageGap(['delta', 'beta', 'alpha'], [])
    expect(gap.missing).toEqual(['alpha', 'beta', 'delta'])
  })
})
