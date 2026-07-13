/**
 * @file Unit tests for the pure npm packument slicer (`src/npm/meta-slice.ts`)
 *   — no network, no cache.
 */

import { describe, expect, it } from 'vitest'

import {
  sliceOneVersion,
  slicePackument,
  sliceVersionMeta,
} from '../../../src/npm/meta-slice'

import type { RawPackument } from '../../../src/npm/meta-types'

describe('sliceOneVersion', () => {
  it('keeps only time when the entry has no dist/engines/deprecated', () => {
    expect(sliceOneVersion({}, '2024-01-01T00:00:00.000Z')).toEqual({
      time: '2024-01-01T00:00:00.000Z',
    })
  })

  it('defaults time to an empty string when publishedAt is undefined', () => {
    expect(sliceOneVersion({}, undefined)).toEqual({ time: '' })
  })

  it('keeps deprecated and engines', () => {
    const slim = sliceOneVersion(
      { deprecated: 'use v2 instead', engines: { node: '>=18' } },
      '2024-01-01T00:00:00.000Z',
    )
    expect(slim.deprecated).toBe('use v2 instead')
    expect(slim.engines).toEqual({ node: '>=18' })
  })

  it('keeps dist.integrity, dist.shasum, dist.tarball, dist.attestations', () => {
    const slim = sliceOneVersion(
      {
        dist: {
          attestations: { url: 'https://registry.npmjs.org/-/npm/v1/x' },
          integrity: 'sha512-abc',
          shasum: 'deadbeef',
          tarball: 'https://registry.npmjs.org/pkg/-/pkg-1.0.0.tgz',
        },
      },
      '2024-01-01T00:00:00.000Z',
    )
    expect(slim.integrity).toBe('sha512-abc')
    expect(slim.shasum).toBe('deadbeef')
    expect(slim.tarball).toBe('https://registry.npmjs.org/pkg/-/pkg-1.0.0.tgz')
    expect(slim.attestations).toEqual({
      url: 'https://registry.npmjs.org/-/npm/v1/x',
    })
  })

  it('omits trustedPublisher/staged when _npmUser is absent (abbreviated variant)', () => {
    const slim = sliceOneVersion({}, '2024-01-01T00:00:00.000Z')
    expect(slim.trustedPublisher).toBeUndefined()
    expect(slim.staged).toBeUndefined()
  })

  it('derives trustedPublisher from _npmUser.trustedPublisher when present', () => {
    const slim = sliceOneVersion(
      { _npmUser: { trustedPublisher: true } },
      '2024-01-01T00:00:00.000Z',
    )
    expect(slim.trustedPublisher).toBe(true)
    expect(slim.staged).toBe(false)
  })

  it('derives staged from a truthy _npmUser.approver', () => {
    const slim = sliceOneVersion(
      { _npmUser: { approver: { name: 'alice' } } },
      '2024-01-01T00:00:00.000Z',
    )
    expect(slim.staged).toBe(true)
    expect(slim.trustedPublisher).toBe(false)
  })

  it('coerces both trust fields to real booleans, not the raw values', () => {
    const slim = sliceOneVersion(
      { _npmUser: { approver: undefined, trustedPublisher: undefined } },
      '2024-01-01T00:00:00.000Z',
    )
    expect(slim.staged).toBe(false)
    expect(slim.trustedPublisher).toBe(false)
  })
})

describe('sliceVersionMeta', () => {
  it('slices every version keyed by version string', () => {
    const raw: RawPackument = {
      time: {
        '1.0.0': '2024-01-01T00:00:00.000Z',
        '2.0.0': '2024-06-01T00:00:00.000Z',
      },
      versions: {
        '1.0.0': { dist: { tarball: 'https://x/1.0.0.tgz' } },
        '2.0.0': { dist: { tarball: 'https://x/2.0.0.tgz' } },
      },
    }
    const sliced = sliceVersionMeta(raw)
    expect(Object.keys(sliced)).toEqual(['1.0.0', '2.0.0'])
    expect(sliced['1.0.0']!.time).toBe('2024-01-01T00:00:00.000Z')
    expect(sliced['2.0.0']!.tarball).toBe('https://x/2.0.0.tgz')
  })

  it('returns an empty map when versions is absent', () => {
    expect(sliceVersionMeta({})).toEqual({})
  })
})

describe('slicePackument', () => {
  it('slices name, distTags, timeCreated/timeModified, and versions', () => {
    const raw: RawPackument = {
      'dist-tags': { latest: '2.0.0', next: '3.0.0-beta.0' },
      name: 'left-pad',
      time: {
        created: '2010-01-01T00:00:00.000Z',
        modified: '2024-06-01T00:00:00.000Z',
        '2.0.0': '2024-06-01T00:00:00.000Z',
      },
      versions: {
        '2.0.0': { dist: { tarball: 'https://x/2.0.0.tgz' } },
      },
    }
    const slim = slicePackument(raw)
    expect(slim.name).toBe('left-pad')
    expect(slim.distTags).toEqual({ latest: '2.0.0', next: '3.0.0-beta.0' })
    expect(slim.timeCreated).toBe('2010-01-01T00:00:00.000Z')
    expect(slim.timeModified).toBe('2024-06-01T00:00:00.000Z')
    expect(Object.keys(slim.versions)).toEqual(['2.0.0'])
  })

  it('ensures a latest key exists even when dist-tags omits it', () => {
    const slim = slicePackument({ 'dist-tags': { next: '1.0.0-rc.0' } })
    expect(slim.distTags['latest']).toBe('')
    expect(slim.distTags['next']).toBe('1.0.0-rc.0')
  })

  it('defaults name to an empty string when absent', () => {
    expect(slicePackument({}).name).toBe('')
  })

  it('stamps lastSynced with the current time', () => {
    const before = Date.now()
    const slim = slicePackument({})
    const after = Date.now()
    expect(slim.lastSynced).toBeGreaterThanOrEqual(before)
    expect(slim.lastSynced).toBeLessThanOrEqual(after)
  })
})
