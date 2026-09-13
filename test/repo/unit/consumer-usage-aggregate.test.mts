import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { safeDeleteSync } from '@socketsecurity/lib-stable/fs/safe'
import {
  AGGREGATE_FUTURE_SKEW_MS,
  AGGREGATE_MAX_AGE_MS,
  aggregateFleetUsageReport,
  consumerAggregateContentDigest,
  consumerRosterIdentity,
  validateConsumerUsageAggregate,
} from '../../../scripts/repo/consumer-usage-aggregate.mts'
import type { ConsumerUsageAggregate } from '../../../scripts/repo/consumer-usage-aggregate.mts'
import { findFleetUsedStubLeaves } from '../../../scripts/repo/check/stubbed-leaves-are-fleet-unused.mts'

const fixtures: string[] = []
const NOW = Date.parse('2026-09-12T12:00:00.000Z')
const REVISION = 'a'.repeat(40)
const SOURCES = `sha256:${'b'.repeat(64)}`
const CONTEXT = {
  producerRevision: REVISION,
  sourceSetDigest: SOURCES,
  now: NOW,
}

function fixtureRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'consumer-aggregate-'))
  fixtures.push(root)
  const rosterDir = path.join(
    root,
    '.claude/skills/fleet/cascading-commits/lib',
  )
  const configDir = path.join(root, '.config/repo')
  mkdirSync(rosterDir, { recursive: true })
  mkdirSync(configDir, { recursive: true })
  mkdirSync(path.join(root, 'src'))
  writeFileSync(
    path.join(rosterDir, 'fleet-repos.json'),
    JSON.stringify({
      repos: [{ name: 'example-consumer', owner: 'example-owner' }],
    }),
  )
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({
      exports: {
        './entry': './dist/entry.js',
        './dependency': './dist/dependency.js',
        './unused': './dist/unused.js',
      },
    }),
  )
  writeFileSync(
    path.join(configDir, 'socket-wheelhouse.json'),
    JSON.stringify({
      buildStubs: {
        unexposed: {
          leaves: ['entry', 'dependency', 'unused'],
          scannedRoster: ['example-consumer'],
        },
      },
    }),
  )
  writeFileSync(
    path.join(root, 'src/entry.mts'),
    "export { dependency } from './dependency.mjs'\n",
  )
  writeFileSync(
    path.join(root, 'src/dependency.mts'),
    'export const dependency = 1\n',
  )
  writeFileSync(path.join(root, 'src/unused.mts'), 'export const unused = 1\n')
  return root
}

function aggregateFor(root: string): ConsumerUsageAggregate {
  const payload = {
    schemaVersion: 1 as const,
    complete: true as const,
    producerRevision: REVISION,
    generatedAt: new Date(NOW).toISOString(),
    roster: consumerRosterIdentity(root),
    sources: { revisionCount: 1, digest: SOURCES },
    usedLeafSpecifiers: ['@socketsecurity/lib-stable/entry'],
  }
  return { ...payload, contentDigest: consumerAggregateContentDigest(payload) }
}

afterEach(() => {
  for (const root of fixtures.splice(0)) {
    safeDeleteSync(root)
  }
})

test('accepts complete evidence for a non-default roster owner', () => {
  const root = fixtureRoot()
  const aggregate = aggregateFor(root)
  expect(validateConsumerUsageAggregate(root, aggregate, CONTEXT)).toEqual(
    aggregate,
  )
})

test.each([
  { complete: false },
  { schemaVersion: 2 },
  { producerRevision: 'c'.repeat(40) },
  { generatedAt: 'invalid' },
  { generatedAt: new Date(NOW - AGGREGATE_MAX_AGE_MS - 1).toISOString() },
  { generatedAt: new Date(NOW + AGGREGATE_FUTURE_SKEW_MS + 1).toISOString() },
  { usedLeafSpecifiers: ['@socketsecurity/lib/absent'] },
  {
    usedLeafSpecifiers: [
      '@socketsecurity/lib/entry',
      '@socketsecurity/lib/entry',
    ],
  },
  {
    usedLeafSpecifiers: [
      '@socketsecurity/lib/unused',
      '@socketsecurity/lib/entry',
    ],
  },
  { usedLeafSpecifiers: [null] },
  { sources: { revisionCount: 2, digest: SOURCES } },
  { sources: { revisionCount: 1, digest: `sha256:${'c'.repeat(64)}` } },
  { roster: { memberCount: 1, digest: `sha256:${'c'.repeat(64)}` } },
  { extra: 'unapproved metadata' },
])('rejects malformed or mismatched aggregate %j', changes => {
  const root = fixtureRoot()
  expect(() =>
    validateConsumerUsageAggregate(
      root,
      { ...aggregateFor(root), ...changes },
      CONTEXT,
    ),
  ).toThrow()
})

test('rejects a changed public leaf with the old content digest', () => {
  const root = fixtureRoot()
  const aggregate = aggregateFor(root)
  aggregate.usedLeafSpecifiers = ['@socketsecurity/lib/unused']
  expect(() =>
    validateConsumerUsageAggregate(root, aggregate, CONTEXT),
  ).toThrow()
})

test('keeps directly used leaves and their local relative dependencies live', () => {
  const root = fixtureRoot()
  const aggregate = validateConsumerUsageAggregate(
    root,
    aggregateFor(root),
    CONTEXT,
  )
  const findings = findFleetUsedStubLeaves(
    root,
    aggregateFleetUsageReport(root, aggregate),
  )
  expect(findings.map(finding => finding.leaf)).toEqual(['entry', 'dependency'])
  expect(
    findings.every(finding => !finding.reason.includes('example-consumer')),
  ).toBe(true)
})

test('content digest ignores object insertion order and uses schema key order', () => {
  const root = fixtureRoot()
  const aggregate = aggregateFor(root)
  const reversed = Object.fromEntries(Object.entries(aggregate).reverse())
  expect(validateConsumerUsageAggregate(root, reversed, CONTEXT)).toEqual(
    aggregate,
  )
})

test('matches the shared producer canonical digest vector', () => {
  expect(
    consumerAggregateContentDigest({
      schemaVersion: 1,
      complete: true,
      producerRevision: '0123456789abcdef0123456789abcdef01234567',
      generatedAt: '2026-09-12T12:00:00.000Z',
      roster: {
        memberCount: 1,
        digest:
          'sha256:26f2619a0423a8c3389654d4f8cbd7bb078b982765d3e1677c9701e423989fae',
      },
      sources: {
        revisionCount: 1,
        digest:
          'sha256:ac1755ce2fd356bc9c40dca0b5fc91578b82cb1c598ad33d394645e4b94d001a',
      },
      usedLeafSpecifiers: ['@socketsecurity/lib-stable/errors/message'],
    }),
  ).toBe(
    'sha256:a09f40cbcd243f00b3c5337e551f0b404dce60b28ced9ca67209b571c7ed8ee7',
  )
})

test.each(['package.json', '.config/repo/socket-wheelhouse.json'])(
  'rejects external metadata at %s',
  file => {
    const root = fixtureRoot()
    const external = fixtureRoot()
    const aggregate = aggregateFor(root)
    safeDeleteSync(path.join(root, file))
    symlinkSync(path.join(external, file), path.join(root, file))
    expect(() =>
      validateConsumerUsageAggregate(root, aggregate, CONTEXT),
    ).toThrow()
  },
)
