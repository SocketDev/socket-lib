/**
 * @file Unit tests for the expose-leaf remediation planner.
 *   A build-stubbed leaf throws on first use, and that error is the signal a
 *   fleet consumer needs the real implementation. These cover the decision the
 *   remediation makes before it touches anything: which requested leaves are
 *   stubbed, which are already live, and which are not published at all.
 *   The rebuild and the commit are deliberately out of scope — they need a
 *   real build. The point of splitting the planner out is that the judgement
 *   is testable without one.
 */

import { describe, expect, test } from 'vitest'

import {
  planExposure,
  recordWithoutLeaves,
} from '../../scripts/repo/expose-leaf.mts'

const EXPORTED = ['http-request/checksum-file', 'cover/formatters', 'fs/safe']

describe('planExposure', () => {
  test('a stubbed leaf is the one to expose', () => {
    expect(
      planExposure(
        ['http-request/checksum-file'],
        ['http-request/checksum-file', 'cover/formatters'],
        EXPORTED,
      ),
    ).toEqual({
      alreadyExposed: [],
      exposed: ['http-request/checksum-file'],
      unknown: [],
    })
  })

  test('an already-live leaf is a no-op, not an error', () => {
    // The end state is what matters: asking for something already exposed
    // should not fail a script someone runs from an error message.
    expect(planExposure(['fs/safe'], ['cover/formatters'], EXPORTED)).toEqual({
      alreadyExposed: ['fs/safe'],
      exposed: [],
      unknown: [],
    })
  })

  test('a leaf outside the exports map is unknown, never silently exposed', () => {
    expect(planExposure(['nope/missing'], [], EXPORTED)).toEqual({
      alreadyExposed: [],
      exposed: [],
      unknown: ['nope/missing'],
    })
  })

  test('partitions a mixed request', () => {
    const plan = planExposure(
      ['http-request/checksum-file', 'fs/safe', 'nope/missing'],
      ['http-request/checksum-file'],
      EXPORTED,
    )
    expect(plan.exposed).toEqual(['http-request/checksum-file'])
    expect(plan.alreadyExposed).toEqual(['fs/safe'])
    expect(plan.unknown).toEqual(['nope/missing'])
  })
})

describe('recordWithoutLeaves', () => {
  test('drops the exposed leaf and keeps the rest', () => {
    const out = recordWithoutLeaves(
      [
        'alphalphalphalphalphalphalphalphalphalpha/one',
        'beta/two',
        'gamma/three',
      ],
      ['alpha'],
      ['beta/two'],
    )
    expect(out.leaves).toEqual([
      'alphalphalphalphalphalphalphalphalphalpha/one',
      'gamma/three',
    ])
  })

  test('preserves the roster record so coverage stays verifiable', () => {
    // Dropping scannedRoster here would silently reopen the hole the coverage
    // check exists to close.
    const out = recordWithoutLeaves(
      ['alphalphalphalphalphalphalphalphalphalpha/one'],
      ['alpha', 'beta'],
      ['alphalphalphalphalphalphalphalphalphalpha/one'],
    )
    expect(out.scannedRoster).toEqual(['alpha', 'beta'])
    expect(out.leaves).toEqual([])
  })

  test('returns a record, not a serialized document', () => {
    // The whole-document write is what deleted fifteen sibling keys. Handing
    // the caller a RECORD makes that mistake unavailable: the only writer that
    // takes it round-trips the file.
    const out = recordWithoutLeaves(['alpha/one'], [], [])
    expect(typeof out).toBe('object')
    expect(Object.keys(out).toSorted()).toEqual(['leaves', 'scannedRoster'])
  })
})
