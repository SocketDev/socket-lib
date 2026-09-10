/**
 * @file Compare complete test inventories and coverage source maps.
 */

import assert from 'node:assert/strict'

import { validateShardCoverageEntry } from '../../fleet/cover/shards-coverage.mts'

export interface CoverageHitLocation {
  path: string
  metric: string
  key: string
  index: number
}

export interface CoverageHitChanges {
  lost: CoverageHitLocation[]
  gained: CoverageHitLocation[]
}

function diagnosticRecord(value: unknown): Record<string, unknown> {
  assert.ok(
    value !== null && typeof value === 'object' && !Array.isArray(value),
  )
  return value as Record<string, unknown>
}

function diagnosticTestIdentities(report: Record<string, unknown>): string[] {
  const files = report['testResults']
  assert.ok(Array.isArray(files))
  return files
    .flatMap(value => {
      const file = diagnosticRecord(value)
      assert.equal(typeof file['name'], 'string')
      const assertions = file['assertionResults']
      assert.ok(Array.isArray(assertions))
      return assertions.map(assertionValue => {
        const assertion = diagnosticRecord(assertionValue)
        assert.equal(typeof assertion['fullName'], 'string')
        assert.equal(typeof assertion['status'], 'string')
        return JSON.stringify([
          file['name'],
          assertion['fullName'],
          assertion['status'],
        ])
      })
    })
    .toSorted()
}

export function compareTestReports(control: unknown, candidate: unknown): void {
  const before = diagnosticRecord(control)
  const after = diagnosticRecord(candidate)
  for (const key of [
    'numTotalTests',
    'numPassedTests',
    'numFailedTests',
    'numPendingTests',
    'numTodoTests',
  ]) {
    const count = before[key]
    assert.ok(
      typeof count === 'number' && Number.isSafeInteger(count) && count >= 0,
    )
    assert.equal(after[key], count)
  }
  const originalIdentities = diagnosticTestIdentities(before)
  const changedIdentities = diagnosticTestIdentities(after)
  assert.equal(originalIdentities.length, before['numTotalTests'])
  assert.equal(changedIdentities.length, after['numTotalTests'])
  assert.deepEqual(changedIdentities, originalIdentities)
  const files = (report: Record<string, unknown>) =>
    (report['testResults'] as Array<Record<string, unknown>>)
      .map(file => file['name'])
      .toSorted()
  assert.deepEqual(files(after), files(before))
}

function coverageHitChanges(
  path: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): CoverageHitChanges {
  const lost: CoverageHitLocation[] = []
  const gained: CoverageHitLocation[] = []
  for (const metric of ['s', 'f', 'b']) {
    const original = diagnosticRecord(before[metric])
    const changed = diagnosticRecord(after[metric])
    assert.deepEqual(
      Object.keys(changed).toSorted(),
      Object.keys(original).toSorted(),
    )
    const keys = Object.keys(original)
    for (let offset = 0, { length } = keys; offset < length; offset += 1) {
      const key = keys[offset]!
      const previous = [original[key]].flat() as number[]
      const next = [changed[key]].flat() as number[]
      assert.equal(next.length, previous.length)
      for (
        let index = 0, { length: countLength } = previous;
        index < countLength;
        index += 1
      ) {
        const count = previous[index]!
        const location = { path, metric, key, index }
        if (count > 0 && next[index] === 0) {
          lost.push(location)
        }
        if (count === 0 && next[index]! > 0) {
          gained.push(location)
        }
      }
    }
  }
  return { __proto__: null, lost, gained } as CoverageHitChanges
}

export function compareCoverageReports(
  control: unknown,
  candidate: unknown,
): CoverageHitChanges {
  const before = diagnosticRecord(control)
  const after = diagnosticRecord(candidate)
  assert.deepEqual(
    Object.keys(after).toSorted(),
    Object.keys(before).toSorted(),
  )
  const lost: CoverageHitLocation[] = []
  const gained: CoverageHitLocation[] = []
  const paths = Object.keys(before)
  for (let index = 0, { length } = paths; index < length; index += 1) {
    const path = paths[index]!
    const original = diagnosticRecord(before[path])
    const changed = diagnosticRecord(after[path])
    validateShardCoverageEntry(original)
    validateShardCoverageEntry(changed)
    assert.equal(original['path'], path)
    assert.equal(changed['path'], path)
    for (const key of ['statementMap', 'fnMap', 'branchMap']) {
      assert.deepEqual(changed[key], original[key])
    }
    const changes = coverageHitChanges(path, original, changed)
    lost.push(...changes.lost)
    gained.push(...changes.gained)
  }
  return { __proto__: null, lost, gained } as CoverageHitChanges
}
