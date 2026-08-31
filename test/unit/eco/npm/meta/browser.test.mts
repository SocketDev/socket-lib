/**
 * @file Specs for the browser twin of the metadata helpers. The helper logic
 *   itself is shared with the Node twin and covered by the `node-*` specs
 *   beside this file; what these assert is that the BROWSER binding reaches
 *   it — that `getVersions` and friends resolve through the browser
 *   `getPackumentSlim`, that `getBatch`'s `pEach` concurrency runs without a
 *   Node timer module, and that the twin's export surface matches `./node`.
 */

import { describe, expect, it } from 'vitest'

import {
  createNpmMetaCache,
  extractHttpStatus,
  getBatch,
  getLatestVersion,
  getPublishDate,
  getVersions,
  getVersionTrustInfo,
  safeGetVersions,
} from '../../../../../src/eco/npm/meta/browser.mjs'
import * as browserTwin from '../../../../../src/eco/npm/meta/browser.mjs'
import * as nodeTwin from '../../../../../src/eco/npm/meta/node.mjs'

import type {
  NpmMetaHttpAdapter,
  RawPackument,
} from '../../../../../src/eco/npm/meta-types.mjs'

const PACKUMENT: RawPackument = {
  'dist-tags': { latest: '2.0.0' },
  name: 'widget',
  time: {
    '1.0.0': '2024-01-01T00:00:00.000Z',
    '2.0.0': '2024-06-01T00:00:00.000Z',
  },
  versions: {
    '1.0.0': { dist: {} },
    '2.0.0': { dist: { integrity: 'sha512-abc' }, _npmUser: {} },
  },
}

function stubAdapter(responder: (url: string) => unknown): NpmMetaHttpAdapter {
  return {
    async json<T>(url: string): Promise<T> {
      return (await responder(url)) as T
    },
  }
}

function freshOptions(seed: string): {
  cache: ReturnType<typeof createNpmMetaCache>
  http: NpmMetaHttpAdapter
} {
  return {
    cache: createNpmMetaCache({ prefix: `bm-${seed}` }),
    http: stubAdapter(() => PACKUMENT),
  }
}

describe('browser meta helpers', () => {
  it('lists versions through the browser packument fetch', async () => {
    const result = await getVersions('widget', freshOptions('versions'))
    expect(result.versions).toEqual(['1.0.0', '2.0.0'])
    expect(result.distTags['latest']).toBe('2.0.0')
  })

  it('resolves the latest version', async () => {
    const result = await getLatestVersion('widget', freshOptions('latest'))
    expect(result.version).toBe('2.0.0')
    expect(result.publishedAt).toBe('2024-06-01T00:00:00.000Z')
  })

  it('reads a single version publish date', async () => {
    await expect(
      getPublishDate('widget', '1.0.0', freshOptions('date')),
    ).resolves.toBe('2024-01-01T00:00:00.000Z')
  })

  it('filters by a semver range', async () => {
    const result = await getVersions('widget', {
      ...freshOptions('range'),
      range: '>=2',
    })
    expect(result.versions).toEqual(['2.0.0'])
  })

  it('runs a bounded-concurrency batch without a Node timer module', async () => {
    const results = await getBatch(['widget', 'widget'], {
      ...freshOptions('batch'),
      concurrency: 2,
    })
    expect(results).toHaveLength(2)
    expect(results.every(r => 'name' in r && r.name === 'widget')).toBe(true)
  })

  it('captures a per-item failure as a PackageError with its status', async () => {
    const results = await getBatch(['widget'], {
      cache: createNpmMetaCache({ prefix: 'bm-fail' }),
      http: stubAdapter(() => {
        throw Object.assign(new Error('gone'), { status: 410 })
      }),
    })
    expect(results[0]).toMatchObject({ name: 'widget', status: 410 })
  })

  it('reads trust signals from the full variant', async () => {
    const info = await getVersionTrustInfo('widget', freshOptions('trust'))
    expect(info['2.0.0']?.integrity).toBe('sha512-abc')
  })

  it('fails open to an empty result', async () => {
    const result = await safeGetVersions('widget', {
      cache: createNpmMetaCache({ prefix: 'bm-safe' }),
      http: stubAdapter(() => {
        throw new Error('offline')
      }),
    })
    expect(result).toEqual({ distTags: {}, time: {}, versions: [] })
  })

  it('extracts a status structurally from either twins error shape', () => {
    expect(extractHttpStatus({ response: { status: 503 } })).toBe(503)
    expect(extractHttpStatus({ status: 404 })).toBe(404)
    expect(extractHttpStatus(new Error('socket hang up'))).toBeUndefined()
  })
})

describe('meta twin parity', () => {
  it('exports every name the Node twin does', () => {
    const nodeNames = Object.keys(nodeTwin).toSorted()
    const browserNames = new Set(Object.keys(browserTwin))
    expect(nodeNames.filter(n => !browserNames.has(n))).toEqual([])
  })
})
