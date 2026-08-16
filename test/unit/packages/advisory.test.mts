import { describe, expect, it } from 'vitest'

import {
  isVersionAffectedByEntry,
  isVersionAffectedByRange,
  osvVulnerableVersions,
} from '../../../src/packages/advisory.mts'

import type {
  OsvAdvisory,
  OsvAffected,
  OsvRange,
} from '../../../src/packages/advisory.mts'

describe('isVersionAffectedByEntry', () => {
  it('matches an explicitly listed version', () => {
    const affected: OsvAffected = { versions: ['1.0.0', '2.0.0'] }
    expect(isVersionAffectedByEntry(affected, '1.0.0')).toBe(true)
    expect(isVersionAffectedByEntry(affected, '3.0.0')).toBe(false)
  })

  it('matches a version inside a range', () => {
    const affected: OsvAffected = {
      ranges: [
        {
          events: [{ introduced: '1.0.0' }, { fixed: '2.0.0' }],
          type: 'SEMVER',
        },
      ],
    }
    expect(isVersionAffectedByEntry(affected, '1.5.0')).toBe(true)
    expect(isVersionAffectedByEntry(affected, '2.0.0')).toBe(false)
  })
})

describe('isVersionAffectedByRange', () => {
  it('closes the window at the fixed version', () => {
    const range: OsvRange = {
      events: [{ introduced: '1.0.0' }, { fixed: '2.0.0' }],
      type: 'SEMVER',
    }
    expect(isVersionAffectedByRange(range, '1.5.0')).toBe(true)
    expect(isVersionAffectedByRange(range, '2.0.0')).toBe(false)
  })

  it('leaves the window open with no fixed', () => {
    const range: OsvRange = {
      events: [{ introduced: '1.0.0' }],
      type: 'SEMVER',
    }
    expect(isVersionAffectedByRange(range, '99.0.0')).toBe(true)
  })

  it('handles multiple introduced/fixed pairs', () => {
    const range: OsvRange = {
      events: [
        { introduced: '1.0.0' },
        { fixed: '2.0.0' },
        { introduced: '3.0.0' },
      ],
      type: 'SEMVER',
    }
    expect(isVersionAffectedByRange(range, '1.5.0')).toBe(true)
    expect(isVersionAffectedByRange(range, '2.5.0')).toBe(false)
    expect(isVersionAffectedByRange(range, '3.5.0')).toBe(true)
  })
})

describe('osvVulnerableVersions', () => {
  it('returns only the affected subset, preserving order', () => {
    const advisory: OsvAdvisory = {
      affected: [{ versions: ['1.0.0', '3.0.0'] }],
    }
    expect(
      osvVulnerableVersions(advisory, ['1.0.0', '2.0.0', '3.0.0']),
    ).toEqual(['1.0.0', '3.0.0'])
  })

  it('covers ranges and explicit lists together', () => {
    const advisory: OsvAdvisory = {
      affected: [
        {
          ranges: [
            {
              events: [{ introduced: '1.0.0' }, { fixed: '2.0.0' }],
              type: 'SEMVER',
            },
          ],
        },
        { versions: ['4.0.0'] },
      ],
    }
    expect(
      osvVulnerableVersions(advisory, ['1.5.0', '3.0.0', '4.0.0']),
    ).toEqual(['1.5.0', '4.0.0'])
  })
})
