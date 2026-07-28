/**
 * @file End-to-end tests for the OCI anon-pull tie-together layer: token →
 *   manifest (index-resolved) → blob, driven entirely by the injected fake
 *   adapter. Proves the single-artifact pull flow and the multi-arch resolve.
 */

import { describe, expect, it } from 'vitest'

import {
  GHCR_REGISTRY,
  pullFirstLayer,
  resolveImageManifest,
} from '../../../src/oci/registry'
import { makeFakeAdapter, sha256Digest } from './oci-test-helpers.mts'

import type { FakeRoute } from './oci-test-helpers.mts'

describe('GHCR_REGISTRY', () => {
  it('is ghcr.io', () => {
    expect(GHCR_REGISTRY).toBe('ghcr.io')
  })
})

describe('resolveImageManifest', () => {
  it('returns a single image manifest unchanged', async () => {
    const url = 'https://ghcr.io/v2/owner/pkg/manifests/v1'
    const routes = new Map<string, FakeRoute>([
      [
        url,
        {
          body: {
            config: { digest: 'sha256:c' },
            layers: [{ digest: 'sha256:l' }],
          },
          headers: { 'docker-content-digest': 'sha256:single' },
        },
      ],
    ])
    const { http } = makeFakeAdapter(routes)
    const result = await resolveImageManifest(
      'ghcr.io',
      'owner/pkg',
      'v1',
      'tok',
      { http },
    )
    expect(result.digest).toBe('sha256:single')
    expect(result.manifest.layers?.[0]?.digest).toBe('sha256:l')
  })

  it('resolves a manifest index down to the platform manifest', async () => {
    const indexUrl = 'https://ghcr.io/v2/owner/pkg/manifests/v1'
    const platformUrl = 'https://ghcr.io/v2/owner/pkg/manifests/sha256:amd'
    const routes = new Map<string, FakeRoute>([
      [
        indexUrl,
        {
          body: {
            manifests: [
              {
                digest: 'sha256:amd',
                platform: { architecture: 'amd64', os: 'linux' },
              },
            ],
          },
          headers: { 'docker-content-digest': 'sha256:index' },
        },
      ],
      [
        platformUrl,
        {
          body: {
            config: { digest: 'sha256:c' },
            layers: [{ digest: 'sha256:l' }],
          },
          headers: { 'docker-content-digest': 'sha256:amd' },
        },
      ],
    ])
    const { http } = makeFakeAdapter(routes)
    const result = await resolveImageManifest(
      'ghcr.io',
      'owner/pkg',
      'v1',
      'tok',
      { http },
    )
    expect(result.manifest.layers?.[0]?.digest).toBe('sha256:l')
    expect(result.digest).toBe('sha256:amd')
  })

  it('fails loud on an empty index', async () => {
    const url = 'https://ghcr.io/v2/owner/pkg/manifests/v1'
    const routes = new Map<string, FakeRoute>([
      [url, { body: { manifests: [{}] }, headers: {} }],
    ])
    const { http } = makeFakeAdapter(routes)
    await expect(
      resolveImageManifest('ghcr.io', 'owner/pkg', 'v1', 'tok', { http }),
    ).rejects.toThrow(/Manifest index had no platform entry/)
  })
})

describe('pullFirstLayer (full anon-pull flow)', () => {
  it('acquires a token, resolves the manifest, and pulls the single layer', async () => {
    const layerBytes = new TextEncoder().encode('the artifact payload')
    const layerDigest = await sha256Digest(layerBytes)
    const routes = new Map<string, FakeRoute>([
      [
        'https://ghcr.io/v2/',
        {
          headers: {
            'www-authenticate':
              'Bearer realm="https://ghcr.io/token",service="ghcr.io"',
          },
          status: 401,
        },
      ],
      [
        'https://ghcr.io/token?service=ghcr.io&scope=repository%3Aowner%2Fpkg%3Apull',
        { body: { token: 'pull-token' } },
      ],
      [
        'https://ghcr.io/v2/owner/pkg/manifests/v1',
        {
          body: {
            config: { digest: 'sha256:cfg' },
            layers: [{ digest: layerDigest, mediaType: 'application/gzip' }],
          },
          headers: { 'docker-content-digest': 'sha256:manifest' },
        },
      ],
      [
        `https://ghcr.io/v2/owner/pkg/blobs/${layerDigest}`,
        { bytes: layerBytes },
      ],
    ])
    const { calls, http } = makeFakeAdapter(routes)
    const result = await pullFirstLayer('ghcr.io', 'owner/pkg', 'v1', { http })
    expect(result.layer.digest).toBe(layerDigest)
    expect(await sha256Digest(result.bytes)).toBe(layerDigest)
    // The manifest + blob requests carried the minted bearer token.
    const blobCall = calls.find(c => c.url.includes('/blobs/'))
    expect(blobCall?.headers?.['authorization']).toBe('Bearer pull-token')
  })

  it('resolves a multi-arch index before pulling the layer', async () => {
    const layerBytes = new Uint8Array([9, 8, 7])
    const layerDigest = await sha256Digest(layerBytes)
    const routes = new Map<string, FakeRoute>([
      ['https://ghcr.io/v2/', { status: 200 }],
      [
        'https://ghcr.io/token?service=ghcr.io&scope=repository%3Aowner%2Fpkg%3Apull',
        { body: { token: 'tok' } },
      ],
      [
        'https://ghcr.io/v2/owner/pkg/manifests/latest',
        {
          body: {
            manifests: [
              {
                digest: 'sha256:amd',
                platform: { architecture: 'amd64', os: 'linux' },
              },
            ],
          },
          headers: { 'docker-content-digest': 'sha256:index' },
        },
      ],
      [
        'https://ghcr.io/v2/owner/pkg/manifests/sha256:amd',
        {
          body: {
            config: { digest: 'sha256:c' },
            layers: [{ digest: layerDigest }],
          },
          headers: { 'docker-content-digest': 'sha256:amd' },
        },
      ],
      [
        `https://ghcr.io/v2/owner/pkg/blobs/${layerDigest}`,
        { bytes: layerBytes },
      ],
    ])
    const { http } = makeFakeAdapter(routes)
    const result = await pullFirstLayer('ghcr.io', 'owner/pkg', 'latest', {
      http,
    })
    expect(Array.from(result.bytes)).toEqual([9, 8, 7])
  })

  it('fails loud when the manifest carries no pullable layer', async () => {
    const routes = new Map<string, FakeRoute>([
      ['https://ghcr.io/v2/', { status: 200 }],
      [
        'https://ghcr.io/token?service=ghcr.io&scope=repository%3Aowner%2Fpkg%3Apull',
        { body: { token: 'tok' } },
      ],
      [
        'https://ghcr.io/v2/owner/pkg/manifests/v1',
        { body: { config: { digest: 'sha256:c' }, layers: [] }, headers: {} },
      ],
    ])
    const { http } = makeFakeAdapter(routes)
    await expect(
      pullFirstLayer('ghcr.io', 'owner/pkg', 'v1', { http }),
    ).rejects.toThrow(/Manifest carried no pullable layer/)
  })
})
