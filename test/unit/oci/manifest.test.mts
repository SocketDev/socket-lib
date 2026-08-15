/**
 * @file Unit tests for the OCI manifest client. Covers pure parsing + the
 *   multi-arch index helpers, and the network fetch across both the OCI and
 *   Docker v2 media types via the injected fake adapter.
 */

import { describe, expect, it } from 'vitest'

import {
  buildManifestUrl,
  getManifest,
  isManifestIndex,
  parseManifest,
  pickPlatformManifestDigest,
} from '../../../src/oci/manifest.mjs'
import { makeFakeAdapter } from './oci-test-helpers.mts'

import type { OciManifest } from '../../../src/oci/types.mjs'
import type { FakeRoute } from './oci-test-helpers.mts'

// OCI / Docker distribution-spec media types — the external spec oracle, held
// as literals here rather than imported from the client under test.
const DOCKER_MANIFEST_LIST_TYPE =
  'application/vnd.docker.distribution.manifest.list.v2+json'
const DOCKER_MANIFEST_TYPE =
  'application/vnd.docker.distribution.manifest.v2+json'
const OCI_INDEX_TYPE = 'application/vnd.oci.image.index.v1+json'
const OCI_MANIFEST_TYPE = 'application/vnd.oci.image.manifest.v1+json'

describe('buildManifestUrl', () => {
  it('builds the /v2/<repo>/manifests/<ref> URL', () => {
    expect(buildManifestUrl('ghcr.io', 'owner/pkg', 'v1.2.3')).toBe(
      'https://ghcr.io/v2/owner/pkg/manifests/v1.2.3',
    )
  })

  it('accepts a digest reference', () => {
    expect(buildManifestUrl('ghcr.io', 'owner/pkg', 'sha256:abc')).toBe(
      'https://ghcr.io/v2/owner/pkg/manifests/sha256:abc',
    )
  })
})

describe('parseManifest', () => {
  it('parses a single OCI image manifest', () => {
    const result = parseManifest({
      config: {
        digest: 'sha256:cfg',
        mediaType: 'application/vnd.oci.image.config.v1+json',
      },
      layers: [{ digest: 'sha256:layer', size: 10 }],
      mediaType: OCI_MANIFEST_TYPE,
      schemaVersion: 2,
    })
    expect(result?.config?.digest).toBe('sha256:cfg')
    expect(result?.layers?.length).toBe(1)
    expect(result?.manifests).toBeUndefined()
  })

  it('parses a Docker v2 manifest identically', () => {
    const result = parseManifest({
      config: { digest: 'sha256:cfg' },
      layers: [{ digest: 'sha256:l1' }, { digest: 'sha256:l2' }],
      mediaType: DOCKER_MANIFEST_TYPE,
    })
    expect(result?.mediaType).toBe(DOCKER_MANIFEST_TYPE)
    expect(result?.layers?.length).toBe(2)
  })

  it('parses a manifest index', () => {
    const result = parseManifest({
      manifests: [
        {
          digest: 'sha256:amd',
          platform: { architecture: 'amd64', os: 'linux' },
        },
      ],
      mediaType: OCI_INDEX_TYPE,
    })
    expect(result?.manifests?.length).toBe(1)
    expect(result?.layers).toBeUndefined()
  })

  it('returns undefined for a non-object', () => {
    expect(parseManifest('nope')).toBeUndefined()
    expect(parseManifest(undefined)).toBeUndefined()
    // `JSON.parse('null')` yields a runtime null without a null literal.
    expect(parseManifest(JSON.parse('null'))).toBeUndefined()
  })

  it('coerces a non-array layers/manifests field to undefined', () => {
    const result = parseManifest({ layers: 'bad', manifests: 5 })
    expect(result?.layers).toBeUndefined()
    expect(result?.manifests).toBeUndefined()
  })
})

describe('isManifestIndex', () => {
  it('returns true for a non-empty manifests[]', () => {
    const m: OciManifest = { manifests: [{ digest: 'sha256:x' }] }
    expect(isManifestIndex(m)).toBe(true)
  })

  it('returns false for a single image manifest', () => {
    const m: OciManifest = { config: { digest: 'sha256:c' }, layers: [] }
    expect(isManifestIndex(m)).toBe(false)
  })

  it('returns false for an empty manifests[]', () => {
    expect(isManifestIndex({ manifests: [] })).toBe(false)
  })
})

describe('pickPlatformManifestDigest', () => {
  const index: OciManifest = {
    manifests: [
      {
        digest: 'sha256:arm',
        platform: { architecture: 'arm64', os: 'linux' },
      },
      {
        digest: 'sha256:amd',
        platform: { architecture: 'amd64', os: 'linux' },
      },
      {
        digest: 'sha256:unknown',
        platform: { architecture: 'unknown', os: 'unknown' },
      },
    ],
  }

  it('prefers linux/amd64 by default', () => {
    expect(pickPlatformManifestDigest(index)).toBe('sha256:amd')
  })

  it('honors an explicit platform request', () => {
    expect(
      pickPlatformManifestDigest(index, { architecture: 'arm64', os: 'linux' }),
    ).toBe('sha256:arm')
  })

  it('falls back to a real platform when the exact match is absent', () => {
    const noAmd: OciManifest = {
      manifests: [
        {
          digest: 'sha256:arm',
          platform: { architecture: 'arm64', os: 'linux' },
        },
        {
          digest: 'sha256:unknown',
          platform: { architecture: 'unknown', os: 'unknown' },
        },
      ],
    }
    expect(pickPlatformManifestDigest(noAmd)).toBe('sha256:arm')
  })

  it('falls back to the first entry when no platform metadata is present', () => {
    const bare: OciManifest = {
      manifests: [{ digest: 'sha256:first' }, { digest: 'sha256:second' }],
    }
    expect(pickPlatformManifestDigest(bare)).toBe('sha256:first')
  })

  it('returns undefined for an empty index', () => {
    expect(pickPlatformManifestDigest({ manifests: [] })).toBeUndefined()
  })
})

describe('getManifest', () => {
  const url = 'https://ghcr.io/v2/owner/pkg/manifests/v1'

  it('sends the bearer token + full Accept and returns digest + manifest', async () => {
    const manifest = {
      config: { digest: 'sha256:cfg' },
      layers: [{ digest: 'sha256:layer' }],
      mediaType: OCI_MANIFEST_TYPE,
    }
    const routes = new Map<string, FakeRoute>([
      [
        url,
        {
          body: manifest,
          headers: {
            'content-type': OCI_MANIFEST_TYPE,
            'docker-content-digest': 'sha256:topdigest',
          },
        },
      ],
    ])
    const { calls, http } = makeFakeAdapter(routes)
    const result = await getManifest('ghcr.io', 'owner/pkg', 'v1', 'tok', {
      http,
    })
    expect(result.digest).toBe('sha256:topdigest')
    expect(result.manifest.config?.digest).toBe('sha256:cfg')
    expect(result.mediaType).toBe(OCI_MANIFEST_TYPE)
    expect(calls[0]?.headers?.['authorization']).toBe('Bearer tok')
    // The Accept offers both the OCI and Docker v2 manifest + index media types.
    const accept = calls[0]?.headers?.['accept'] ?? ''
    expect(accept).toContain(OCI_MANIFEST_TYPE)
    expect(accept).toContain(OCI_INDEX_TYPE)
    expect(accept).toContain(DOCKER_MANIFEST_TYPE)
    expect(accept).toContain(DOCKER_MANIFEST_LIST_TYPE)
  })

  it('omits Authorization when the token is empty', async () => {
    const routes = new Map<string, FakeRoute>([
      [url, { body: { layers: [{ digest: 'sha256:l' }] } }],
    ])
    const { calls, http } = makeFakeAdapter(routes)
    await getManifest('ghcr.io', 'owner/pkg', 'v1', '', { http })
    expect(calls[0]?.headers?.['authorization']).toBeUndefined()
  })

  it('handles a Docker manifest list (index) body', async () => {
    const routes = new Map<string, FakeRoute>([
      [
        url,
        {
          body: {
            manifests: [
              {
                digest: 'sha256:amd',
                platform: { architecture: 'amd64', os: 'linux' },
              },
            ],
            mediaType: DOCKER_MANIFEST_LIST_TYPE,
          },
          headers: { 'docker-content-digest': 'sha256:indexdigest' },
        },
      ],
    ])
    const { http } = makeFakeAdapter(routes)
    const result = await getManifest('ghcr.io', 'owner/pkg', 'v1', 'tok', {
      http,
    })
    expect(isManifestIndex(result.manifest)).toBe(true)
    expect(result.digest).toBe('sha256:indexdigest')
  })

  it('fails loud on a non-2xx response', async () => {
    const routes = new Map<string, FakeRoute>([
      [url, { status: 404, statusText: 'Not Found' }],
    ])
    const { http } = makeFakeAdapter(routes)
    await expect(
      getManifest('ghcr.io', 'owner/pkg', 'v1', 'tok', { http }),
    ).rejects.toThrow(/Manifest fetch failed/)
  })

  it('fails loud when the body is not an object', async () => {
    const routes = new Map<string, FakeRoute>([[url, { text: '"a string"' }]])
    const { http } = makeFakeAdapter(routes)
    await expect(
      getManifest('ghcr.io', 'owner/pkg', 'v1', 'tok', { http }),
    ).rejects.toThrow(/Manifest body was not a JSON object/)
  })
})
