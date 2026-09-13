import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { safeDeleteSync } from '@socketsecurity/lib-stable/fs/safe'
import { makeUsageFixture } from './fixture.mts'
import {
  plannedConsumerLeaves,
  validatePlannedApiReferences,
} from '../../../../scripts/repo/consumer-usage/planned.mts'
import { aggregateFleetUsageReport } from '../../../../scripts/repo/consumer-usage-aggregate.mts'
import { findFleetUsedStubLeaves } from '../../../../scripts/repo/check/stubbed-leaves-are-fleet-unused.mts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) safeDeleteSync(root)
})

function fixture(duplicate: boolean = false) {
  const result = makeUsageFixture()
  roots.push(result.root)
  mkdirSync(path.join(result.root, 'src'))
  writeFileSync(
    path.join(result.root, 'src/moved.mts'),
    'export function plannedApi() {}\n',
  )
  writeFileSync(
    path.join(result.root, 'src/other.mts'),
    duplicate
      ? 'export function plannedApi() {}\n'
      : 'export function otherApi() {}\n',
  )
  writeFileSync(
    path.join(result.root, 'package.json'),
    JSON.stringify({
      exports: { './current': './dist/moved.js', './other': './dist/other.js' },
    }),
  )
  return result
}

test('resolves a moved API by name despite an obsolete path hint', () => {
  const { root } = fixture()
  expect(
    plannedConsumerLeaves(root, [
      { api: 'plannedApi', targetVersion: '7.0.2', pathHint: 'obsolete' },
    ]),
  ).toEqual(['current'])
})

test('rejects duplicate public names without a current disambiguating hint', () => {
  const { root } = fixture(true)
  for (const pathHint of [undefined, 'obsolete']) {
    expect(() =>
      plannedConsumerLeaves(root, [
        {
          api: 'plannedApi',
          targetVersion: '7.0.2',
          ...(pathHint === undefined ? {} : { pathHint }),
        },
      ]),
    ).toThrow()
  }
})

test('uses a path hint only to select among duplicate public names', () => {
  const { root } = fixture(true)
  expect(
    plannedConsumerLeaves(root, [
      { api: 'plannedApi', targetVersion: '7.0.2', pathHint: 'other' },
    ]),
  ).toEqual(['other'])
})

test('rejects a missing API even when its hint names a public module', () => {
  const { root } = fixture()
  expect(() =>
    plannedConsumerLeaves(root, [
      { api: 'missingApi', targetVersion: '7.0.2', pathHint: 'current' },
    ]),
  ).toThrow()
})

test('resolves renamed re-exports without executing source modules', () => {
  const { root } = fixture()
  writeFileSync(
    path.join(root, 'src/other.mts'),
    "export { plannedApi as renamedApi } from './moved.mjs'\nthrow new Error('must not execute')\n",
  )
  expect(
    plannedConsumerLeaves(root, [
      { api: 'renamedApi', targetVersion: '7.0.2' },
    ]),
  ).toEqual(['other'])
})

test('planned APIs make a build-stubbed leaf fail the usage gate', () => {
  const { root, verified } = fixture()
  writeFileSync(
    path.join(root, '.config/repo/socket-wheelhouse.json'),
    JSON.stringify({
      buildStubs: {
        unexposed: { leaves: ['current'], scannedRoster: ['example-consumer'] },
      },
    }),
  )
  const report = aggregateFleetUsageReport(root, {
    ...verified.aggregate,
    usedLeafSpecifiers: [],
    plannedApiReferences: [
      { api: 'plannedApi', targetVersion: '7.0.2', pathHint: 'obsolete' },
    ],
  })
  expect(
    findFleetUsedStubLeaves(root, { report }).map(finding => finding.leaf),
  ).toEqual(['current'])
})

test('rejects malformed, duplicate, and unsorted planned references', () => {
  const reference = { api: 'plannedApi', targetVersion: '7.0.2' }
  for (const value of [
    null,
    [{}],
    [{ ...reference, api: 'bad_name' }],
    [{ ...reference, targetVersion: 'next' }],
    [{ ...reference, pathHint: '@invalid' }],
    [reference, reference],
    [{ ...reference, api: 'secondApi' }, reference],
  ]) {
    expect(() => validatePlannedApiReferences(value)).toThrow()
  }
})

test('accepts producer locale ordering across identifier case', () => {
  expect(() =>
    validatePlannedApiReferences([
      { api: 'findApi', targetVersion: '7.0.2' },
      { api: 'MIN', targetVersion: '7.0.2' },
    ]),
  ).not.toThrow()
})

test('planned moved leaves retain their source dependencies in the stub gate', () => {
  const { root, verified } = fixture()
  writeFileSync(
    path.join(root, 'src/moved.mts'),
    "import { otherApi } from './other.mjs'\nexport function plannedApi() { return otherApi() }\n",
  )
  writeFileSync(
    path.join(root, '.config/repo/socket-wheelhouse.json'),
    JSON.stringify({
      buildStubs: {
        unexposed: { leaves: ['other'], scannedRoster: ['example-consumer'] },
      },
    }),
  )
  const report = aggregateFleetUsageReport(root, {
    ...verified.aggregate,
    usedLeafSpecifiers: [],
    plannedApiReferences: [{ api: 'plannedApi', targetVersion: '7.0.2' }],
  })
  expect(
    findFleetUsedStubLeaves(root, { report }).map(finding => finding.leaf),
  ).toEqual(['other'])
})

test('does not mistake function parameters for public API names', () => {
  const { root } = fixture()
  writeFileSync(
    path.join(root, 'src/moved.mts'),
    'export function plannedApi(privateParameter: string) { return privateParameter }\n',
  )
  expect(() =>
    plannedConsumerLeaves(root, [
      { api: 'privateParameter', targetVersion: '7.0.2', pathHint: 'current' },
    ]),
  ).toThrow()
})
