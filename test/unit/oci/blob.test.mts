/**
 * @file Unit tests for the OCI blob client. Verifies bearer + URL shape, the
 *   raw-bytes return, and that the returned bytes digest back to the requested
 *   digest, which is the caller-side verification the fetcher delegates.
 */

import { describe, expect, it } from 'vitest'

import { buildBlobUrl, getBlob, getBlobJson } from '../../../src/oci/blob'
import { makeFakeAdapter, sha256Digest } from './oci-test-helpers.mts'

import type { FakeRoute } from './oci-test-helpers.mts'

describe('buildBlobUrl', () => {
  it('builds the /v2/<repo>/blobs/<digest> URL', () => {
    expect(buildBlobUrl('ghcr.io', 'owner/pkg', 'sha256:abc')).toBe(
      'https://ghcr.io/v2/owner/pkg/blobs/sha256:abc',
    )
  })
})

describe('getBlob', () => {
  it('sends the bearer token and returns the raw bytes', async () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5])
    const digest = await sha256Digest(payload)
    const url = `https://ghcr.io/v2/owner/pkg/blobs/${digest}`
    const routes = new Map<string, FakeRoute>([[url, { bytes: payload }]])
    const { calls, http } = makeFakeAdapter(routes)
    const bytes = await getBlob('ghcr.io', 'owner/pkg', digest, 'tok', { http })
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4, 5])
    expect(calls[0]?.headers?.['authorization']).toBe('Bearer tok')
  })

  it('returns bytes that digest back to the requested digest', async () => {
    const payload = new TextEncoder().encode('artifact contents')
    const digest = await sha256Digest(payload)
    const url = `https://ghcr.io/v2/owner/pkg/blobs/${digest}`
    const routes = new Map<string, FakeRoute>([[url, { bytes: payload }]])
    const { http } = makeFakeAdapter(routes)
    const bytes = await getBlob('ghcr.io', 'owner/pkg', digest, 'tok', { http })
    expect(await sha256Digest(bytes)).toBe(digest)
  })

  it('omits Authorization when the token is empty', async () => {
    const url = 'https://ghcr.io/v2/owner/pkg/blobs/sha256:x'
    const routes = new Map<string, FakeRoute>([
      [url, { bytes: new Uint8Array([0]) }],
    ])
    const { calls, http } = makeFakeAdapter(routes)
    await getBlob('ghcr.io', 'owner/pkg', 'sha256:x', '', { http })
    expect(calls[0]?.headers?.['authorization']).toBeUndefined()
  })

  it('fails loud on a non-2xx response', async () => {
    const url = 'https://ghcr.io/v2/owner/pkg/blobs/sha256:missing'
    const routes = new Map<string, FakeRoute>([
      [url, { status: 404, statusText: 'Not Found' }],
    ])
    const { http } = makeFakeAdapter(routes)
    await expect(
      getBlob('ghcr.io', 'owner/pkg', 'sha256:missing', 'tok', { http }),
    ).rejects.toThrow(/Blob fetch failed/)
  })
})

describe('getBlobJson', () => {
  it('parses a JSON config blob with the bearer token', async () => {
    const url = 'https://ghcr.io/v2/owner/pkg/blobs/sha256:cfg'
    const routes = new Map<string, FakeRoute>([
      [url, { body: { created: '2026-01-01T00:00:00Z' } }],
    ])
    const { calls, http } = makeFakeAdapter(routes)
    const config = await getBlobJson<{ created: string }>(
      'ghcr.io',
      'owner/pkg',
      'sha256:cfg',
      'tok',
      { http },
    )
    expect(config.created).toBe('2026-01-01T00:00:00Z')
    expect(calls[0]?.headers?.['authorization']).toBe('Bearer tok')
    expect(calls[0]?.headers?.['accept']).toBe('application/json')
  })

  it('omits Authorization when the token is empty', async () => {
    const url = 'https://ghcr.io/v2/owner/pkg/blobs/sha256:cfg'
    const routes = new Map<string, FakeRoute>([
      [url, { body: { created: '2026-01-01T00:00:00Z' } }],
    ])
    const { calls, http } = makeFakeAdapter(routes)
    await getBlobJson('ghcr.io', 'owner/pkg', 'sha256:cfg', '', { http })
    expect(calls[0]?.headers?.['authorization']).toBeUndefined()
  })
})
