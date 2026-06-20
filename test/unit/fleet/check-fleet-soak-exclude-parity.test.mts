// vitest specs for fleet-soak-exclude-parity's pure helpers. Focused on
// expiredExpectedPins — the second invariant that fails the gate when an
// EXPECTED soak-pin has cleared its 7-day window (the dead entry that
// tug-of-wars between the cascade's insert + prune loops).

import assert from 'node:assert/strict'

import { test } from 'vitest'

import {
  diffSoakExclude,
  expiredExpectedPins,
  parseSoakExcludeBlock,
} from '../../../scripts/fleet/check/fleet-soak-exclude-parity.mts'

const TODAY = '2026-06-09'

// ── expiredExpectedPins ─────────────────────────────────────────

test('expiredExpectedPins flags a version-pin whose removable date has passed', () => {
  const annotations = {
    'rolldown@1.0.3': { published: '2026-05-27', removable: '2026-06-03' },
  }
  assert.deepEqual(expiredExpectedPins(['rolldown@1.0.3'], annotations, TODAY), [
    'rolldown@1.0.3',
  ])
})

test('expiredExpectedPins treats removable === today as still soaking (exclusive)', () => {
  // pnpm clears the 7×24h window at the publish TIMESTAMP + 7d, which lands
  // somewhere on the `removable` date (not at 00:00). So on removable === today
  // the unpinned install may still be rejected — keep the pin one more day.
  const annotations = {
    'pkg@1.0.0': { published: '2026-06-02', removable: TODAY },
  }
  assert.deepEqual(expiredExpectedPins(['pkg@1.0.0'], annotations, TODAY), [])
})

test('expiredExpectedPins flags a pin whose removable date is strictly before today', () => {
  const annotations = {
    'pkg@1.0.0': { published: '2026-06-01', removable: '2026-06-08' },
  }
  assert.deepEqual(expiredExpectedPins(['pkg@1.0.0'], annotations, TODAY), [
    'pkg@1.0.0',
  ])
})

test('expiredExpectedPins keeps a pin still inside its soak window', () => {
  const annotations = {
    'fresh@2.0.0': { published: '2026-06-06', removable: '2026-06-13' },
  }
  assert.deepEqual(expiredExpectedPins(['fresh@2.0.0'], annotations, TODAY), [])
})

test('expiredExpectedPins skips globs (no version to soak)', () => {
  assert.deepEqual(
    expiredExpectedPins(['@socketsecurity/*', '@stuie/*'], {}, TODAY),
    [],
  )
})

test('expiredExpectedPins skips bare names (no @version)', () => {
  assert.deepEqual(expiredExpectedPins(['shell-quote'], {}, TODAY), [])
})

test('expiredExpectedPins skips a version-pin with no annotation', () => {
  // Can't date it offline; the parity arm separately requires versioned
  // entries to be annotated, so an unannotated pin is left for that arm.
  assert.deepEqual(expiredExpectedPins(['mystery@1.0.0'], {}, TODAY), [])
})

test('expiredExpectedPins keys a scoped name on the LAST @ (the version)', () => {
  const annotations = {
    '@vitest/ui@4.1.6': { published: '2026-05-11', removable: '2026-05-18' },
  }
  assert.deepEqual(
    expiredExpectedPins(['@vitest/ui@4.1.6'], annotations, TODAY),
    ['@vitest/ui@4.1.6'],
  )
})

test('expiredExpectedPins returns only the cleared subset of a mixed list', () => {
  const expected = [
    '@socketsecurity/*', // glob — skip
    'shell-quote', // bare — skip
    'cleared@1.0.0', // expired — flag
    'fresh@2.0.0', // soaking — keep
    'undated@3.0.0', // no annotation — skip
  ]
  const annotations = {
    'cleared@1.0.0': { published: '2026-05-01', removable: '2026-05-08' },
    'fresh@2.0.0': { published: '2026-06-06', removable: '2026-06-13' },
  }
  assert.deepEqual(expiredExpectedPins(expected, annotations, TODAY), [
    'cleared@1.0.0',
  ])
})

// ── parseSoakExcludeBlock (sanity — the existing helper, previously untested) ──

test('parseSoakExcludeBlock reads the minimumReleaseAgeExclude bullets', () => {
  const yaml = [
    'foo: bar',
    'minimumReleaseAgeExclude:',
    "  - '@socketsecurity/*'",
    "  - 'rolldown@1.1.0'  # published: 2026-06-03 | removable: 2026-06-10",
    '',
    'catalog:',
    '  rolldown: 1.1.0',
  ].join('\n')
  assert.deepEqual(parseSoakExcludeBlock(yaml), [
    '@socketsecurity/*',
    'rolldown@1.1.0',
  ])
})

test('parseSoakExcludeBlock returns [] when the block is absent', () => {
  assert.deepEqual(parseSoakExcludeBlock('catalog:\n  foo: 1.0.0\n'), [])
})

// ── diffSoakExclude (sanity — the parity arm) ───────────────────

test('diffSoakExclude surfaces a wheelhouse pin with no canonical counterpart', () => {
  assert.deepEqual(diffSoakExclude(['orphan@1.0.0'], ['@socketsecurity/*']), [
    'orphan@1.0.0',
  ])
})

test('diffSoakExclude treats a glob + a bare→pinned upgrade as covered', () => {
  assert.deepEqual(
    diffSoakExclude(
      ['@socketsecurity/sdk', 'rolldown'],
      ['@socketsecurity/*', 'rolldown@1.1.0'],
    ),
    [],
  )
})
