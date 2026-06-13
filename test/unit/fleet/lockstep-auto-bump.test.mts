// vitest specs for lockstep/auto-bump — the pure tag resolver (the four tag
// schemes + stability filter + track-latest/major-gate/locked) and the report
// partition. The git/jq apply orchestration is left to the skill.

import { describe, test } from 'vitest'
import assert from 'node:assert/strict'

import {
  compareSemVer,
  isStableTag,
  parseTag,
  planFromReport,
  resolveTarget,
} from '../../../scripts/fleet/lockstep/auto-bump.mts'
import type { Report } from '../../../scripts/fleet/lockstep/types.mts'

describe('isStableTag', () => {
  test('rejects pre-release / nightly / preview suffixes', () => {
    assert.equal(isStableTag('v1.2.3'), true)
    assert.equal(isStableTag('v1.2.3-rc.1'), false)
    assert.equal(isStableTag('1.2.0-beta'), false)
    assert.equal(isStableTag('1.2.0-alpha.4'), false)
    assert.equal(isStableTag('foo-1.2.3-nightly'), false)
    assert.equal(isStableTag('v2.0.0-dev'), false)
  })
})

describe('parseTag — the four schemes', () => {
  test('v-prefixed semver', () => {
    const p = parseTag('v1.2.3')!
    assert.deepEqual(p.version, { major: 1, minor: 2, patch: 3 })
    assert.equal(p.prefix, '')
  })
  test('bare semver', () => {
    assert.deepEqual(parseTag('1.2.3')!.version, { major: 1, minor: 2, patch: 3 })
  })
  test('project-prefixed', () => {
    const p = parseTag('openssl-3.2.1')!
    assert.equal(p.prefix, 'openssl')
    assert.deepEqual(p.version, { major: 3, minor: 2, patch: 1 })
  })
  test('underscore style', () => {
    const p = parseTag('curl_8_5_0')!
    assert.equal(p.prefix, 'curl')
    assert.deepEqual(p.version, { major: 8, minor: 5, patch: 0 })
  })
  test('undefined when no semver triple', () => {
    assert.equal(parseTag('not-a-version'), undefined)
    assert.equal(parseTag('main'), undefined)
  })
})

describe('compareSemVer', () => {
  test('orders by major, then minor, then patch', () => {
    assert.ok(compareSemVer({ major: 1, minor: 0, patch: 0 }, { major: 2, minor: 0, patch: 0 }) < 0)
    assert.ok(compareSemVer({ major: 1, minor: 3, patch: 0 }, { major: 1, minor: 2, patch: 9 }) > 0)
    assert.equal(compareSemVer({ major: 1, minor: 2, patch: 3 }, { major: 1, minor: 2, patch: 3 }), 0)
  })
})

describe('resolveTarget', () => {
  test('track-latest picks the newest same-prefix stable tag, skipping pre-release', () => {
    assert.equal(
      resolveTarget('v1.2.3', ['v1.2.3', 'v1.3.0', 'v1.3.0-rc.1', 'v2.0.0'], 'track-latest')
        .targetTag,
      'v2.0.0',
    )
  })
  test('major-gate blocks a major jump but allows minor/patch', () => {
    const blocked = resolveTarget('v1.2.3', ['v1.3.0', 'v2.0.0'], 'major-gate')
    assert.equal(blocked.targetTag, undefined)
    assert.ok(blocked.skipReason?.includes('major'))
    assert.equal(
      resolveTarget('v1.2.3', ['v1.3.0', 'v1.4.5'], 'major-gate').targetTag,
      'v1.4.5',
    )
  })
  test('locked never bumps', () => {
    const r = resolveTarget('v1.2.3', ['v2.0.0'], 'locked')
    assert.equal(r.targetTag, undefined)
    assert.ok(r.skipReason?.includes('locked'))
  })
  test('already-at-latest skips', () => {
    assert.ok(
      resolveTarget('v2.0.0', ['v1.0.0', 'v2.0.0'], 'track-latest').skipReason?.includes(
        'already',
      ),
    )
  })
  test('prefix isolation: a v-pin never jumps to a different-prefix tag', () => {
    assert.equal(
      resolveTarget('v1.2.3', ['v1.5.0', 'openssl-9.9.9'], 'track-latest').targetTag,
      'v1.5.0',
    )
  })
})

function vpReport(over: Record<string, unknown>): Report {
  return {
    area: 'a',
    drift_count: 1,
    head_sha: 'b',
    id: 'vp',
    kind: 'version-pin',
    messages: [],
    pinned_sha: 'a',
    pinned_tag: 'v1.0.0',
    severity: 'drift',
    upgrade_policy: 'track-latest',
    upstream: 'u',
    ...over,
  } as Report
}

describe('planFromReport', () => {
  test('partitions auto (resolvable version-pin) from advisory', () => {
    const reports: Report[] = [
      vpReport({ id: 'a', upstream: 'u1', pinned_tag: 'v1.0.0' }),
      vpReport({ id: 'locked', upstream: 'u2', upgrade_policy: 'locked' }),
      vpReport({ id: 'ok', upstream: 'u3', severity: 'ok' }),
    ]
    const plan = planFromReport(reports, { u1: ['v1.0.0', 'v1.2.0'] })
    assert.equal(plan.auto.length, 1)
    assert.equal(plan.auto[0]!.id, 'a')
    assert.equal(plan.auto[0]!.targetTag, 'v1.2.0')
    // locked → advisory; ok → skipped entirely.
    assert.ok(plan.advisory.some(r => r.id === 'locked'))
    assert.ok(!plan.advisory.some(r => r.id === 'ok'))
  })
  test('a version-pin with no newer tag becomes advisory, not a silent drop', () => {
    const plan = planFromReport([vpReport({ id: 'x', upstream: 'u', pinned_tag: 'v2.0.0' })], {
      u: ['v1.0.0', 'v2.0.0'],
    })
    assert.equal(plan.auto.length, 0)
    assert.ok(plan.advisory.some(r => r.id === 'x'))
  })
})
