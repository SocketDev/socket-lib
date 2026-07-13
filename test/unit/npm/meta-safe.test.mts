/**
 * @file Unit tests for `src/npm/meta.ts`'s `safe*` fail-open wrappers —
 *   each returns its documented fallback on error and passes through the
 *   underlying result on success. HTTP is mocked via `StubHttpAdapter` (no
 *   live network); cacache persistence is isolated per test via a unique
 *   `SOCKET_CACACHE_DIR`.
 */

import { describe, expect, it } from 'vitest'

import {
  safeGetLatestVersion,
  safeGetPackumentSlim,
  safeGetPublishDate,
  safeGetVersions,
  safeGetVersionTrustInfo,
} from '../../../src/npm/meta'
import {
  createStubHttpAdapter,
  freshCache,
  setupNpmMetaCacheIsolation,
} from './meta-test-helpers.mts'

import type { RawPackument } from '../../../src/npm/meta-types'

const RAW: RawPackument = {
  'dist-tags': { latest: '1.0.0' },
  name: 'widget',
  time: { '1.0.0': '2024-01-01T00:00:00.000Z' },
  versions: { '1.0.0': { dist: {} } },
}

function failingHttp() {
  return createStubHttpAdapter(() => {
    throw new Error('registry unreachable')
  })
}

setupNpmMetaCacheIsolation('socket-test-npm-meta-safe')

describe('safeGetPackumentSlim', () => {
  it('returns the packument on success', async () => {
    const result = await safeGetPackumentSlim('widget', {
      cache: freshCache('a'),
      http: createStubHttpAdapter(() => RAW),
    })
    expect(result?.name).toBe('widget')
  })

  it('returns undefined on error', async () => {
    const result = await safeGetPackumentSlim('widget', {
      cache: freshCache('b'),
      http: failingHttp(),
    })
    expect(result).toBeUndefined()
  })
})

describe('safeGetVersions', () => {
  it('returns the version list on success', async () => {
    const result = await safeGetVersions('widget', {
      cache: freshCache('c'),
      http: createStubHttpAdapter(() => RAW),
    })
    expect(result.versions).toEqual(['1.0.0'])
  })

  it('returns an empty result on error', async () => {
    const result = await safeGetVersions('widget', {
      cache: freshCache('d'),
      http: failingHttp(),
    })
    expect(result).toEqual({ distTags: {}, time: {}, versions: [] })
  })
})

describe('safeGetLatestVersion', () => {
  it('returns the latest version on success', async () => {
    const result = await safeGetLatestVersion('widget', {
      cache: freshCache('e'),
      http: createStubHttpAdapter(() => RAW),
    })
    expect(result?.version).toBe('1.0.0')
  })

  it('returns undefined on error', async () => {
    const result = await safeGetLatestVersion('widget', {
      cache: freshCache('f'),
      http: failingHttp(),
    })
    expect(result).toBeUndefined()
  })
})

describe('safeGetPublishDate', () => {
  it('returns the publish date on success', async () => {
    const result = await safeGetPublishDate('widget', '1.0.0', {
      cache: freshCache('g'),
      http: createStubHttpAdapter(() => RAW),
    })
    expect(result).toBe('2024-01-01T00:00:00.000Z')
  })

  it('returns undefined on error', async () => {
    const result = await safeGetPublishDate('widget', '1.0.0', {
      cache: freshCache('h'),
      http: failingHttp(),
    })
    expect(result).toBeUndefined()
  })
})

describe('safeGetVersionTrustInfo', () => {
  it('returns the per-version trust map on success', async () => {
    const result = await safeGetVersionTrustInfo('widget', {
      cache: freshCache('i'),
      http: createStubHttpAdapter(() => RAW),
    })
    expect(Object.keys(result)).toEqual(['1.0.0'])
  })

  it('returns an empty record on error', async () => {
    const result = await safeGetVersionTrustInfo('widget', {
      cache: freshCache('j'),
      http: failingHttp(),
    })
    expect(result).toEqual({})
  })
})
