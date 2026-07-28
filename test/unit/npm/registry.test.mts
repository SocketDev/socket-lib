/**
 * @file Unit tests for the browser-safe npm registry client.
 *   Pure-parser tests use sample JSON fixtures (no network).
 *   Network helper tests inject a nock-backed `{ http: { json } }` adapter.
 */

import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import nock from 'nock'

import {
  buildCdnPath,
  detectTrustedPublisher,
  encodePackageName,
  getAttestations,
  getOrgPackages,
  getPackument,
  getVersionManifest,
  getWeeklyDownloads,
  hasProvenance,
  isVersionPublished,
  parsePackument,
} from '../../../src/npm/registry'

import type {
  AttestationBundle,
  NpmHttpOptions,
  PackumentVersion,
} from '../../../src/npm/registry'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const fixturesDir = path.resolve(testDir, '../../fixtures/npm')
const localRequire = createRequire(import.meta.url)

const packumentFixture = localRequire(
  path.join(fixturesDir, 'packument-express.json'),
) as Record<string, unknown>
const attestationFixture = localRequire(
  path.join(fixturesDir, 'attestation-bundle.json'),
) as AttestationBundle

function makeHttpAdapter(
  responses: Map<string, unknown>,
): NpmHttpOptions['http'] {
  return {
    async json<T>(url: string): Promise<T> {
      if (!responses.has(url)) {
        throw new Error(`Unexpected URL in test: ${url}`)
      }
      return responses.get(url) as T
    },
  }
}

describe('encodePackageName', () => {
  it('encodes unscoped names for registry', () => {
    expect(encodePackageName('express')).toBe('express')
  })

  it('encodes scoped names for registry with @scope%2Fname form', () => {
    expect(encodePackageName('@scope/name')).toBe('@scope%2Fname')
  })

  it('encodes unscoped names for CDN identically', () => {
    expect(encodePackageName('express', { cdn: true })).toBe('express')
  })

  it('encodes scoped names for CDN preserving the literal slash', () => {
    expect(encodePackageName('@scope/name', { cdn: true })).toBe(
      '%40scope/name',
    )
  })

  it('handles names with special chars for registry', () => {
    expect(encodePackageName('@my-org/my-pkg')).toBe('@my-org%2Fmy-pkg')
  })

  it('handles names with special chars for CDN', () => {
    expect(encodePackageName('@my-org/my-pkg', { cdn: true })).toBe(
      '%40my-org/my-pkg',
    )
  })
})

describe('buildCdnPath', () => {
  it('builds path for unscoped package', () => {
    expect(buildCdnPath('express', '4.18.2')).toBe(
      'express@4.18.2/package.json',
    )
  })

  it('builds path for scoped package with split-encode', () => {
    expect(buildCdnPath('@scope/pkg', '1.0.0')).toBe(
      '%40scope/pkg@1.0.0/package.json',
    )
  })

  it('encodes the version', () => {
    expect(buildCdnPath('pkg', '1.0.0-beta.1')).toBe(
      'pkg@1.0.0-beta.1/package.json',
    )
  })
})

describe('parsePackument', () => {
  it('parses a valid packument fixture', () => {
    const result = parsePackument(packumentFixture)
    expect(result).toBeDefined()
    expect(result?.name).toBe('express')
    expect(result?.['dist-tags']!['latest']).toBe('4.18.2')
    expect(result?.distTags['latest']).toBe('4.18.2')
    expect(typeof result?.versions['4.18.2']).toBe('object')
  })

  it('adds distTags alias matching dist-tags', () => {
    const result = parsePackument(packumentFixture)
    expect(result?.distTags).toEqual(result?.['dist-tags'])
  })

  it('returns undefined for null/undefined', () => {
    expect(parsePackument(undefined)).toBeUndefined()
  })

  it('returns undefined when missing dist-tags', () => {
    expect(parsePackument({ versions: {} })).toBeUndefined()
  })

  it('returns undefined when missing versions', () => {
    expect(parsePackument({ 'dist-tags': {} })).toBeUndefined()
  })

  it('returns undefined for a non-object', () => {
    expect(parsePackument('not-an-object')).toBeUndefined()
  })

  it('defaults dist-tags/versions to empty objects and name to empty string when present but falsy', () => {
    const result = parsePackument({
      'dist-tags': undefined,
      versions: undefined,
    })
    expect(result).toEqual({
      'dist-tags': {},
      distTags: {},
      name: '',
      time: undefined,
      versions: {},
    })
  })
})

describe('hasProvenance', () => {
  it('returns false when dist is absent', () => {
    const v: PackumentVersion = { version: '1.0.0' }
    expect(hasProvenance(v)).toBe(false)
  })

  it('returns false when dist.attestations is absent', () => {
    const v: PackumentVersion = { dist: { tarball: 'https://x.com/t.tgz' } }
    expect(hasProvenance(v)).toBe(false)
  })

  it('returns true when dist.attestations is present', () => {
    const v: PackumentVersion = {
      dist: {
        attestations: {
          url: 'https://registry.npmjs.org/-/npm/v1/attestations/pkg@1.0.0',
        },
      },
    }
    expect(hasProvenance(v)).toBe(true)
  })

  it('returns true from the fixture for version 5.0.0', () => {
    const packument = parsePackument(packumentFixture)
    const v500 = packument?.versions['5.0.0']
    expect(v500).toBeDefined()
    expect(hasProvenance(v500!)).toBe(true)
  })

  it('returns false from the fixture for version 4.18.2', () => {
    const packument = parsePackument(packumentFixture)
    const v4 = packument?.versions['4.18.2']
    expect(v4).toBeDefined()
    expect(hasProvenance(v4!)).toBe(false)
  })
})

describe('detectTrustedPublisher', () => {
  it('returns configured: false when no attestations', () => {
    const v: PackumentVersion = { dist: { tarball: 'x' } }
    const result = detectTrustedPublisher(v)
    expect(result).toEqual({ configured: false })
  })

  it('returns configured: true when attestations present', () => {
    const v: PackumentVersion = {
      dist: {
        attestations: {
          url: 'https://registry.npmjs.org/-/npm/v1/attestations/pkg@1.0.0',
        },
      },
    }
    const result = detectTrustedPublisher(v)
    expect(result.configured).toBe(true)
  })

  it('does not populate repo/workflow from packument alone', () => {
    const v: PackumentVersion = {
      dist: {
        attestations: {
          url: 'https://registry.npmjs.org/-/npm/v1/attestations/pkg@1.0.0',
        },
      },
    }
    const result = detectTrustedPublisher(v)
    expect(result.repo).toBeUndefined()
    expect(result.workflow).toBeUndefined()
  })
})

describe('getPackument (nock-mocked http adapter)', () => {
  afterEach(() => {
    nock.cleanAll()
  })

  it('fetches and returns a parsed packument', async () => {
    const responses = new Map([
      ['https://registry.npmjs.org/express', packumentFixture],
    ])
    const http = makeHttpAdapter(responses)
    const result = await getPackument('express', { http })
    expect(result.name).toBe('express')
    expect(result.distTags['latest']).toBe('4.18.2')
  })

  it('fetches a scoped package with @scope%2Fname encoding', async () => {
    const scopedPackument = {
      name: '@scope/pkg',
      'dist-tags': { latest: '1.0.0' },
      versions: { '1.0.0': { dist: {} } },
    }
    const responses = new Map([
      ['https://registry.npmjs.org/@scope%2Fpkg', scopedPackument],
    ])
    const http = makeHttpAdapter(responses)
    const result = await getPackument('@scope/pkg', { http })
    expect(result.name).toBe('@scope/pkg')
  })

  it('throws when the response is not a valid packument', async () => {
    const responses = new Map([
      ['https://registry.npmjs.org/express', { error: 'Not found' }],
    ])
    const http = makeHttpAdapter(responses)
    await expect(getPackument('express', { http })).rejects.toThrow(
      'getPackument: invalid packument response',
    )
  })
})

describe('getVersionManifest (nock-mocked http adapter)', () => {
  it('fetches via CDN with split-encode for scoped packages', async () => {
    const manifest = { name: '@scope/pkg', version: '1.0.0' }
    const responses = new Map([
      [
        'https://cdn.jsdelivr.net/npm/%40scope/pkg@1.0.0/package.json',
        manifest,
      ],
    ])
    const http = makeHttpAdapter(responses)
    const result = await getVersionManifest('@scope/pkg', '1.0.0', { http })
    expect(result['name']).toBe('@scope/pkg')
  })

  it('fetches via CDN for unscoped packages', async () => {
    const manifest = { name: 'express', version: '4.18.2' }
    const responses = new Map([
      ['https://cdn.jsdelivr.net/npm/express@4.18.2/package.json', manifest],
    ])
    const http = makeHttpAdapter(responses)
    const result = await getVersionManifest('express', '4.18.2', { http })
    expect(result['version']).toBe('4.18.2')
  })
})

describe('getWeeklyDownloads (nock-mocked http adapter)', () => {
  it('fetches download stats', async () => {
    const downloadData = { downloads: 1_234_567, package: 'express' }
    const responses = new Map([
      ['https://api.npmjs.org/downloads/point/last-week/express', downloadData],
    ])
    const http = makeHttpAdapter(responses)
    const result = await getWeeklyDownloads('express', { http })
    expect(result.downloads).toBe(1_234_567)
    expect(result.package).toBe('express')
  })

  it('encodes scoped package names with @scope%2Fname form', async () => {
    const downloadData = { downloads: 42, package: '@scope/pkg' }
    const responses = new Map([
      [
        'https://api.npmjs.org/downloads/point/last-week/@scope%2Fpkg',
        downloadData,
      ],
    ])
    const http = makeHttpAdapter(responses)
    const result = await getWeeklyDownloads('@scope/pkg', { http })
    expect(result.downloads).toBe(42)
  })
})

describe('getAttestations (nock-mocked http adapter)', () => {
  it('returns the attestation bundle', async () => {
    const responses = new Map([
      [
        'https://registry.npmjs.org/-/npm/v1/attestations/express@5.0.0',
        attestationFixture,
      ],
    ])
    const http = makeHttpAdapter(responses)
    const result = await getAttestations('express', '5.0.0', { http })
    expect(result).toBeDefined()
    expect(result?.attestations?.length).toBe(1)
  })

  it('returns undefined on fetch error (404-equivalent)', async () => {
    const http: NpmHttpOptions['http'] = {
      async json() {
        throw new Error('Not found')
      },
    }
    const result = await getAttestations('no-such-pkg', '1.0.0', { http })
    expect(result).toBeUndefined()
  })

  it('encodes scoped package names correctly', async () => {
    const responses = new Map([
      [
        'https://registry.npmjs.org/-/npm/v1/attestations/@scope%2Fpkg@1.0.0',
        attestationFixture,
      ],
    ])
    const http = makeHttpAdapter(responses)
    const result = await getAttestations('@scope/pkg', '1.0.0', { http })
    expect(result).toBeDefined()
  })
})

describe('getOrgPackages (nock-mocked http adapter)', () => {
  it('returns package names as a string array', async () => {
    const rawResponse = { 'my-pkg': 'latest', 'other-pkg': 'latest' }
    const responses = new Map([
      ['https://registry.npmjs.org/-/org/my-org/package', rawResponse],
    ])
    const http = makeHttpAdapter(responses)
    const result = await getOrgPackages('my-org', { http })
    expect(result).toContain('my-pkg')
    expect(result).toContain('other-pkg')
    expect(result.length).toBe(2)
  })

  it('encodes the org name', async () => {
    const responses = new Map([
      ['https://registry.npmjs.org/-/org/my%20org/package', {}],
    ])
    const http = makeHttpAdapter(responses)
    const result = await getOrgPackages('my org', { http })
    expect(result).toEqual([])
  })
})

describe('nock integration — getPackument with nock-intercepted http adapter', () => {
  beforeEach(() => {
    nock.disableNetConnect()
  })

  afterEach(() => {
    nock.cleanAll()
    nock.enableNetConnect()
  })

  it('url reaches the correct registry path via the http adapter', async () => {
    nock('https://registry.npmjs.org')
      .get('/express')
      .reply(200, packumentFixture)

    let capturedUrl: string | undefined
    const http: NpmHttpOptions['http'] = {
      async json<T>(url: string): Promise<T> {
        capturedUrl = url
        const responses = new Map([[url, packumentFixture]])
        return makeHttpAdapter(responses).json<T>(url)
      },
    }

    const result = await getPackument('express', { http })
    expect(capturedUrl).toBe('https://registry.npmjs.org/express')
    expect(result.name).toBe('express')
  })
})

describe('isVersionPublished', () => {
  function httpReturning(body: unknown): NpmHttpOptions['http'] {
    return {
      async json<T>(): Promise<T> {
        return body as T
      },
    }
  }

  function httpThrowing(): NpmHttpOptions['http'] {
    return {
      async json<T>(): Promise<T> {
        throw new Error('404 Not Found')
      },
    }
  }

  it('returns true when the version is in the packument', async () => {
    const published = await isVersionPublished('express', '4.18.2', {
      http: httpReturning(packumentFixture),
    })
    expect(published).toBe(true)
  })

  it('returns false when the version is absent from the packument', async () => {
    const published = await isVersionPublished('express', '99.99.99', {
      http: httpReturning(packumentFixture),
    })
    expect(published).toBe(false)
  })

  it('returns false when the package does not exist or the fetch fails', async () => {
    const published = await isVersionPublished('nonexistent-pkg', '1.0.0', {
      http: httpThrowing(),
    })
    expect(published).toBe(false)
  })
})
