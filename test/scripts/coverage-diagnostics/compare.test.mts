/**
 * @file Tests for complete coverage diagnostic comparisons.
 */

import assert from 'node:assert/strict'
import { describe, expect, test } from 'vitest'

import {
  compareCoverageReports,
  compareTestReports,
} from '../../../scripts/repo/coverage-diagnostics/compare.mts'

function testReport(name = 'example test', status = 'passed') {
  return {
    numTotalTests: 1,
    numPassedTests: 1,
    numFailedTests: 0,
    numPendingTests: 0,
    numTodoTests: 0,
    testResults: [
      {
        name: '/example/test.test.mts',
        assertionResults: [{ fullName: name, status }],
      },
    ],
  }
}

function coverageReport() {
  const location = {
    start: { line: 1, column: 0 },
    end: { line: 1, column: 8 },
  }
  return {
    '/example/src/example.mts': {
      path: '/example/src/example.mts',
      statementMap: { 0: location },
      fnMap: { 0: { name: 'example', decl: location, loc: location } },
      branchMap: { 0: { type: 'if', locations: [location, location] } },
      s: { 0: 1 },
      f: { 0: 1 },
      b: { 0: [1, 0] },
    },
  }
}

describe('compareTestReports', () => {
  test('preserves exact identities and statuses beyond aggregate counts', () => {
    expect(() =>
      compareTestReports(testReport(), testReport('replacement test')),
    ).toThrow(assert.AssertionError)
    expect(() =>
      compareTestReports(testReport(), testReport('example test', 'skipped')),
    ).toThrow(assert.AssertionError)
    expect(compareTestReports(testReport(), testReport())).toBeUndefined()
  })

  test('rejects malformed or missing report data', () => {
    expect(() => compareTestReports({}, {})).toThrow(assert.AssertionError)
    expect(() =>
      compareTestReports(testReport(), { ...testReport(), numTotalTests: 2 }),
    ).toThrow(assert.AssertionError)
  })
})

test('rejects missing cases and empty-file substitutions', () => {
  const missing = { ...testReport(), testResults: [] }
  expect(() => compareTestReports(missing, missing)).toThrow(
    assert.AssertionError,
  )
  const first = {
    ...testReport(),
    numTotalTests: 0,
    numPassedTests: 0,
    testResults: [{ name: 'first.test.mts', assertionResults: [] }],
  }
  const second = {
    ...first,
    testResults: [{ name: 'second.test.mts', assertionResults: [] }],
  }
  expect(() => compareTestReports(first, second)).toThrow(assert.AssertionError)
})

describe('compareCoverageReports', () => {
  test('keeps zero-hit entries and rejects denominator or map changes', () => {
    const changed = coverageReport()
    changed['/example/src/example.mts'].statementMap[0].start.line = 2
    expect(() => compareCoverageReports(coverageReport(), changed)).toThrow(
      assert.AssertionError,
    )
    expect(() => compareCoverageReports(coverageReport(), {})).toThrow(
      assert.AssertionError,
    )
  })

  test('records lost and gained branch hits while allowing repeated hit counts', () => {
    const changed = coverageReport()
    changed['/example/src/example.mts'].s[0] = 5
    changed['/example/src/example.mts'].b[0] = [0, 1]
    expect(compareCoverageReports(coverageReport(), changed)).toEqual({
      lost: [
        { path: '/example/src/example.mts', metric: 'b', key: '0', index: 0 },
      ],
      gained: [
        { path: '/example/src/example.mts', metric: 'b', key: '0', index: 1 },
      ],
    })
  })

  test('rejects invalid negative counters and preserves exact parity', () => {
    const changed = coverageReport()
    changed['/example/src/example.mts'].s[0] = -1
    expect(() => compareCoverageReports(coverageReport(), changed)).toThrow(
      Error,
    )
    expect(compareCoverageReports(coverageReport(), coverageReport())).toEqual({
      lost: [],
      gained: [],
    })
  })
})
