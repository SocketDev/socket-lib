/**
 * @file Unit tests for the trust-status helpers in packages/provenance.ts
 *   (getTrustStatus / getTrustLevel / getTrustLevelName / compareTrust /
 *   didTrustDecrease / TRUST_LEVELS). Split out of provenance.test.mts to stay
 *   under the file-line cap; the parsing + fetch helpers live there.
 */

import { describe, expect, it } from 'vitest'

// Published-snapshot binding used to BUILD an expected value inside
// `expect(...)`. The system-under-test bindings still come from `src/`
// below; this stable alias satisfies `socket/no-src-import-in-test-expect`.
import { getTrustLevelName as stableGetTrustLevelName } from '@socketsecurity/lib-stable/packages/provenance'

import {
  compareTrust,
  didTrustDecrease,
  getTrustLevel,
  getTrustLevelName,
  getTrustStatus,
  TRUST_LEVELS,
} from '../../../src/packages/provenance'

const fullyTrustedDoc = {
  _npmUser: { name: 'someone', trustedPublisher: { id: 'github' } },
  dist: { attestations: { provenance: { predicateType: 'slsa' } } },
}
const provenanceOnlyDoc = {
  _npmUser: { name: 'someone' },
  dist: { attestations: { provenance: { predicateType: 'slsa' } } },
}
const bareDoc = {
  _npmUser: { name: 'someone' },
  dist: { tarball: 'https://registry.npmjs.org/x/-/x-1.0.0.tgz' },
}
const stagedPublishDoc = {
  _npmUser: {
    name: 'someone',
    approver: { name: 'approver-bot' },
    trustedPublisher: { id: 'github' },
  },
  dist: { attestations: { provenance: { predicateType: 'slsa' } } },
}
const stagedPublishOnlyDoc = {
  _npmUser: { name: 'someone', approver: 'approver-bot' },
  dist: { tarball: 'https://registry.npmjs.org/x/-/x-1.0.0.tgz' },
}

describe('packages/provenance — trust status', () => {
  it('getTrustStatus returns all-false for non-object input', () => {
    expect(getTrustStatus(undefined)).toEqual({
      provenance: false,
      trustedPublisher: false,
      stagedPublish: false,
    })
    expect(getTrustStatus('nope')).toEqual({
      provenance: false,
      trustedPublisher: false,
      stagedPublish: false,
    })
  })

  it('getTrustStatus reads provenance + trustedPublisher from a full doc', () => {
    expect(getTrustStatus(fullyTrustedDoc)).toEqual({
      provenance: true,
      trustedPublisher: true,
      stagedPublish: false,
    })
  })

  it('getTrustStatus reads provenance only when no trusted publisher', () => {
    expect(getTrustStatus(provenanceOnlyDoc)).toEqual({
      provenance: true,
      trustedPublisher: false,
      stagedPublish: false,
    })
  })

  it('getTrustStatus returns all-false for a bare doc', () => {
    expect(getTrustStatus(bareDoc)).toEqual({
      provenance: false,
      trustedPublisher: false,
      stagedPublish: false,
    })
  })

  it('getTrustStatus reads stagedPublish from _npmUser.approver (per pnpm#12056)', () => {
    expect(getTrustStatus(stagedPublishOnlyDoc)).toEqual({
      provenance: false,
      trustedPublisher: false,
      stagedPublish: true,
    })
  })

  it('getTrustStatus reads stagedPublish alongside trustedPublisher + provenance', () => {
    expect(getTrustStatus(stagedPublishDoc)).toEqual({
      provenance: true,
      trustedPublisher: true,
      stagedPublish: true,
    })
  })

  it('getTrustStatus ignores falsy approver values', () => {
    expect(
      getTrustStatus({
        _npmUser: { name: 'someone', approver: undefined },
        dist: {},
      }),
    ).toEqual({
      provenance: false,
      trustedPublisher: false,
      stagedPublish: false,
    })
    expect(
      getTrustStatus({
        _npmUser: { name: 'someone', approver: '' },
        dist: {},
      }),
    ).toEqual({
      provenance: false,
      trustedPublisher: false,
      stagedPublish: false,
    })
    // oxlint-disable-next-line socket/prefer-undefined-over-null -- registry JSON may carry null; tested explicitly as a falsy form.
    expect(getTrustStatus({ _npmUser: { approver: null }, dist: {} })).toEqual({
      provenance: false,
      trustedPublisher: false,
      stagedPublish: false,
    })
  })

  it('getTrustLevel maps statuses to the 0..3 ladder', () => {
    expect(getTrustLevel(getTrustStatus(bareDoc))).toBe(0)
    expect(getTrustLevel(getTrustStatus(provenanceOnlyDoc))).toBe(1)
    expect(getTrustLevel(getTrustStatus(fullyTrustedDoc))).toBe(2)
    expect(getTrustLevel(getTrustStatus(stagedPublishDoc))).toBe(3)
    expect(getTrustLevel(getTrustStatus(stagedPublishOnlyDoc))).toBe(3)
  })

  it('getTrustLevelName maps statuses to names', () => {
    expect(getTrustLevelName(getTrustStatus(bareDoc))).toBe('none')
    expect(getTrustLevelName(getTrustStatus(provenanceOnlyDoc))).toBe(
      'provenance',
    )
    expect(getTrustLevelName(getTrustStatus(fullyTrustedDoc))).toBe(
      'trustedPublisher',
    )
    expect(getTrustLevelName(getTrustStatus(stagedPublishDoc))).toBe(
      'stagedPublish',
    )
    expect(getTrustLevelName(getTrustStatus(stagedPublishOnlyDoc))).toBe(
      'stagedPublish',
    )
  })

  it('compareTrust compares by trust level', () => {
    const bare = getTrustStatus(bareDoc)
    const prov = getTrustStatus(provenanceOnlyDoc)
    const full = getTrustStatus(fullyTrustedDoc)
    const staged = getTrustStatus(stagedPublishDoc)
    expect(compareTrust(bare, full)).toBe(-1)
    expect(compareTrust(full, bare)).toBe(1)
    expect(compareTrust(prov, prov)).toBe(0)
    expect(compareTrust(full, staged)).toBe(-1)
    expect(compareTrust(staged, full)).toBe(1)
  })

  it('didTrustDecrease detects a drop in trust level', () => {
    const bare = getTrustStatus(bareDoc)
    const full = getTrustStatus(fullyTrustedDoc)
    const staged = getTrustStatus(stagedPublishDoc)
    expect(didTrustDecrease(full, bare)).toBe(true)
    expect(didTrustDecrease(bare, full)).toBe(false)
    expect(didTrustDecrease(full, full)).toBe(false)
    expect(didTrustDecrease(staged, full)).toBe(true)
    expect(didTrustDecrease(full, staged)).toBe(false)
  })

  it('TRUST_LEVELS index round-trips with getTrustLevel', () => {
    expect(TRUST_LEVELS).toEqual([
      'none',
      'provenance',
      'trustedPublisher',
      'stagedPublish',
    ])
    // The index IS the level: TRUST_LEVELS[getTrustLevel(x)] === name.
    for (const status of [
      getTrustStatus(bareDoc),
      getTrustStatus(provenanceOnlyDoc),
      getTrustStatus(fullyTrustedDoc),
      getTrustStatus(stagedPublishOnlyDoc),
      getTrustStatus(stagedPublishDoc),
    ]) {
      expect(TRUST_LEVELS[getTrustLevel(status)]).toBe(
        stableGetTrustLevelName(status),
      )
    }
  })
})
