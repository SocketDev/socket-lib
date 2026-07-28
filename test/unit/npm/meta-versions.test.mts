/**
 * @file Unit tests for `src/npm/meta.ts`'s version-filtering helpers —
 *   `getVersions` (range / loose / after / minAgeDays), `getLatestVersion`
 *   (tag + range paths), `getPublishDate`, and the `isMatured` end-of-UTC-day
 *   anchor. HTTP is mocked via `StubHttpAdapter` (no live network); cacache
 *   persistence is isolated per test via a unique `SOCKET_CACACHE_DIR`.
 */

import { describe, expect, it } from 'vitest'

import {
  getLatestVersion,
  getPublishDate,
  getVersions,
  isMatured,
  toEpochMs,
} from '../../../src/npm/meta'
import { PackumentNotFoundError } from '../../../src/npm/meta-cache'
import {
  createStubHttpAdapter,
  freshCache,
  freshOptions as freshOptionsFor,
  setupNpmMetaCacheIsolation,
} from './meta-test-helpers.mts'

import type { RawPackument } from '../../../src/npm/meta-types'

const RAW: RawPackument = {
  'dist-tags': { latest: '2.0.0', next: '3.0.0-beta.0' },
  name: 'widget',
  time: {
    '1.0.0': '2024-01-01T00:00:00.000Z',
    '1.2.03': '2024-01-05T00:00:00.000Z',
    '1.5.0': '2024-02-01T00:00:00.000Z',
    '2.0.0': '2024-06-01T00:00:00.000Z',
    '3.0.0-beta.0': '2024-06-15T00:00:00.000Z',
  },
  versions: {
    '1.0.0': { dist: {} },
    '1.2.03': { dist: {} },
    '1.5.0': { dist: {} },
    '2.0.0': { dist: {} },
    '3.0.0-beta.0': { dist: {} },
  },
}

function freshOptions(seed: string) {
  return freshOptionsFor(seed, () => RAW)
}

setupNpmMetaCacheIsolation('socket-test-npm-meta-versions')

describe('getVersions', () => {
  it('returns every version, its time map, and distTags with no filters', async () => {
    const result = await getVersions('widget', freshOptions('a'))
    expect(result.versions).toEqual([
      '1.0.0',
      '1.2.03',
      '1.5.0',
      '2.0.0',
      '3.0.0-beta.0',
    ])
    expect(result.time['2.0.0']).toBe('2024-06-01T00:00:00.000Z')
    expect(result.distTags['latest']).toBe('2.0.0')
  })

  it('filters by a strict semver range', async () => {
    const result = await getVersions('widget', {
      ...freshOptions('b'),
      range: '^1.0.0',
    })
    expect(result.versions).toEqual(['1.0.0', '1.5.0'])
  })

  it('excludes a loose-only version under strict range matching', async () => {
    const result = await getVersions('widget', {
      ...freshOptions('c'),
      range: '^1.0.0',
    })
    expect(result.versions).not.toContain('1.2.03')
  })

  it('includes a loose-only version when loose: true', async () => {
    const result = await getVersions('widget', {
      ...freshOptions('d'),
      loose: true,
      range: '*',
    })
    expect(result.versions).toContain('1.2.03')
  })

  it('filters by an ISO time floor via after', async () => {
    const result = await getVersions('widget', {
      ...freshOptions('e'),
      after: '2024-02-01T00:00:00.000Z',
    })
    expect(result.versions).toEqual(['1.5.0', '2.0.0', '3.0.0-beta.0'])
  })

  it('filters by minAgeDays relative to now', async () => {
    const now = Date.now()
    const raw: RawPackument = {
      'dist-tags': { latest: 'b' },
      name: 'widget',
      time: {
        old: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
        recent: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      },
      versions: { old: { dist: {} }, recent: { dist: {} } },
    }
    const result = await getVersions('widget', {
      cache: freshCache('f'),
      http: createStubHttpAdapter(() => raw),
      minAgeDays: 7,
    })
    expect(result.versions).toEqual(['old'])
  })

  it('includes a prerelease version only when includePrerelease is true', async () => {
    // `<=3.0.0` has no prerelease-tagged comparator, so by default a
    // prerelease of 3.0.0 never satisfies it — only `includePrerelease`
    // lifts that restriction.
    const withoutFlag = await getVersions('widget', {
      ...freshOptions('prerelease-off'),
      range: '<=3.0.0',
    })
    expect(withoutFlag.versions).not.toContain('3.0.0-beta.0')

    const withFlag = await getVersions('widget', {
      ...freshOptions('prerelease-on'),
      includePrerelease: true,
      range: '<=3.0.0',
    })
    expect(withFlag.versions).toContain('3.0.0-beta.0')
  })

  it('filters by a numeric epoch (number) via after', async () => {
    const floor = Date.parse('2024-02-01T00:00:00.000Z')
    const result = await getVersions('widget', {
      ...freshOptions('epoch-number'),
      after: floor,
    })
    expect(result.versions).toEqual(['1.5.0', '2.0.0', '3.0.0-beta.0'])
  })

  it('filters by a numeric epoch string via after', async () => {
    const floor = String(Date.parse('2024-02-01T00:00:00.000Z'))
    const result = await getVersions('widget', {
      ...freshOptions('epoch-string'),
      after: floor,
    })
    expect(result.versions).toEqual(['1.5.0', '2.0.0', '3.0.0-beta.0'])
  })

  it('throws a RangeError for an after value that is neither an ISO date nor a numeric epoch', async () => {
    await expect(
      getVersions('widget', {
        ...freshOptions('epoch-bad'),
        after: 'not-a-date',
      }),
    ).rejects.toThrow(RangeError)
  })
})

describe('toEpochMs', () => {
  it('treats an all-digits string as an epoch, never as a date', () => {
    expect(toEpochMs('1706745600000')).toBe(1_706_745_600_000)
  })

  it('passes a number through unchanged', () => {
    expect(toEpochMs(1_706_745_600_000)).toBe(1_706_745_600_000)
  })

  it('parses a non-digit string as an ISO 8601 date', () => {
    expect(toEpochMs('2024-02-01T00:00:00.000Z')).toBe(
      Date.parse('2024-02-01T00:00:00.000Z'),
    )
  })

  it('throws a RangeError naming the bad input when unparseable', () => {
    expect(() => toEpochMs('not-a-date')).toThrow(/not-a-date/)
  })
})

describe('getLatestVersion', () => {
  it('resolves distTags.latest when no range is given', async () => {
    const result = await getLatestVersion('widget', freshOptions('g'))
    expect(result.version).toBe('2.0.0')
    expect(result.publishedAt).toBe('2024-06-01T00:00:00.000Z')
    expect(result.distTags['latest']).toBe('2.0.0')
  })

  it('resolves the newest version satisfying range, overriding distTags.latest', async () => {
    const result = await getLatestVersion('widget', {
      ...freshOptions('h'),
      range: '^1.0.0',
    })
    expect(result.version).toBe('1.5.0')
    expect(result.publishedAt).toBe('2024-02-01T00:00:00.000Z')
  })

  it('throws PackumentNotFoundError instead of falling back to distTags.latest when no version satisfies range', async () => {
    await expect(
      getLatestVersion('widget', {
        ...freshOptions('i'),
        range: '^9.0.0',
      }),
    ).rejects.toBeInstanceOf(PackumentNotFoundError)
  })

  it('resolves a dist-tag to its tagged version, even when it is a prerelease', async () => {
    const result = await getLatestVersion('widget', {
      ...freshOptions('tag'),
      range: 'next',
    })
    expect(result.version).toBe('3.0.0-beta.0')
  })

  it('throws PackumentNotFoundError when a dist-tag points at a version absent from the packument', async () => {
    const raw: RawPackument = {
      'dist-tags': { ghost: '9.9.9', latest: '1.0.0' },
      name: 'widget',
      time: { '1.0.0': '2024-01-01T00:00:00.000Z' },
      versions: { '1.0.0': { dist: {} } },
    }
    await expect(
      getLatestVersion('widget', {
        cache: freshCache('ghost-tag'),
        http: createStubHttpAdapter(() => raw),
        range: 'ghost',
      }),
    ).rejects.toBeInstanceOf(PackumentNotFoundError)
  })

  it('resolves the true semver-max even when a lower version published more recently (LTS backport)', async () => {
    // 1.2.1 is an LTS backport published AFTER 2.0.0 shipped — publish-time
    // order and semver order disagree here on purpose.
    const raw: RawPackument = {
      'dist-tags': { latest: '2.0.0' },
      name: 'lts-pkg',
      time: {
        '1.0.0': '2024-01-01T00:00:00.000Z',
        '1.2.1': '2024-04-01T00:00:00.000Z',
        '2.0.0': '2024-03-01T00:00:00.000Z',
      },
      versions: {
        '1.0.0': { dist: {} },
        '1.2.1': { dist: {} },
        '2.0.0': { dist: {} },
      },
    }
    const http = createStubHttpAdapter(() => raw)

    const wideOpen = await getLatestVersion('lts-pkg', {
      cache: freshCache('backport-wide'),
      http,
      range: '>=1.0.0',
    })
    expect(wideOpen.version).toBe('2.0.0')

    const capped = await getLatestVersion('lts-pkg', {
      cache: freshCache('backport-cap'),
      http,
      range: '>=1.0.0 <2.0.0',
    })
    expect(capped.version).toBe('1.2.1')
  })
})

describe('getPublishDate', () => {
  it('returns the ISO publish time for a known version', async () => {
    expect(await getPublishDate('widget', '1.0.0', freshOptions('j'))).toBe(
      '2024-01-01T00:00:00.000Z',
    )
  })

  it('returns undefined for a version not in the packument', async () => {
    expect(
      await getPublishDate('widget', '9.9.9', freshOptions('k')),
    ).toBeUndefined()
  })
})

describe('isMatured', () => {
  it('anchors maturity to the END of the published UTC day, not the moment of publish', () => {
    const maturesAt = Date.UTC(2024, 0, 2, 23, 59, 59, 999)
    expect(isMatured('2024-01-01T00:00:01.000Z', 1, maturesAt)).toBe(true)
    expect(isMatured('2024-01-01T00:00:01.000Z', 1, maturesAt - 1)).toBe(false)
  })

  it('matures two same-day publishes at the identical instant', () => {
    const maturesAt = Date.UTC(2024, 0, 2, 23, 59, 59, 999)
    const early = isMatured('2024-01-01T00:00:01.000Z', 1, maturesAt)
    const late = isMatured('2024-01-01T23:59:59.999Z', 1, maturesAt)
    expect(early).toBe(true)
    expect(late).toBe(true)
  })

  it('with minAgeDays: 0, matures at the end of the publish day itself', () => {
    const endOfPublishDay = Date.UTC(2024, 0, 1, 23, 59, 59, 999)
    expect(isMatured('2024-01-01T05:00:00.000Z', 0, endOfPublishDay)).toBe(true)
    expect(isMatured('2024-01-01T05:00:00.000Z', 0, endOfPublishDay - 1)).toBe(
      false,
    )
  })

  it('returns false for an unparseable publishedAt', () => {
    expect(isMatured('not-a-date', 1, Date.now())).toBe(false)
  })
})

describe('getVersions — exact version / dist-tag / unknown-tag resolution', () => {
  it('resolves range as an exact version, returning just that version', async () => {
    const result = await getVersions('widget', {
      ...freshOptions('exact'),
      range: '1.5.0',
    })
    expect(result.versions).toEqual(['1.5.0'])
  })

  it('throws PackumentNotFoundError for an exact version absent from the packument', async () => {
    await expect(
      getVersions('widget', {
        ...freshOptions('exact-missing'),
        range: '9.9.9',
      }),
    ).rejects.toBeInstanceOf(PackumentNotFoundError)
  })

  it('resolves range as a dist-tag name, returning the tagged version', async () => {
    const result = await getVersions('widget', {
      ...freshOptions('tag'),
      range: 'next',
    })
    expect(result.versions).toEqual(['3.0.0-beta.0'])
  })

  it('never returns the full list for an exact-version miss', async () => {
    const attempt = getVersions('widget', {
      ...freshOptions('no-full-list'),
      range: '9.9.9',
    })
    await expect(attempt).rejects.toThrow()
  })

  it('treats an unrecognized tag-like string as an empty-matching range, not an error or the full list', async () => {
    const result = await getVersions('widget', {
      ...freshOptions('garbage'),
      range: 'not-a-real-tag-or-range',
    })
    expect(result.versions).toEqual([])
  })

  it('normalizes a non-canonical exact-version spelling (leading "v") before looking it up', async () => {
    const result = await getVersions('widget', {
      ...freshOptions('normalize-v'),
      range: 'v1.5.0',
    })
    expect(result.versions).toEqual(['1.5.0'])
  })

  it('throws PackumentNotFoundError when a dist-tag points at a version absent from the packument', async () => {
    const raw: RawPackument = {
      'dist-tags': { ghost: '9.9.9', latest: '1.0.0' },
      name: 'widget',
      time: { '1.0.0': '2024-01-01T00:00:00.000Z' },
      versions: { '1.0.0': { dist: {} } },
    }
    await expect(
      getVersions('widget', {
        cache: freshCache('ghost-tag'),
        http: createStubHttpAdapter(() => raw),
        range: 'ghost',
      }),
    ).rejects.toBeInstanceOf(PackumentNotFoundError)
  })
})
