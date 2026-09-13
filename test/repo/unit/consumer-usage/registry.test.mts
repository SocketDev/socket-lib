import { Buffer } from 'node:buffer'
import { afterEach, expect, test, vi } from 'vitest'
import { safeDeleteSync } from '@socketsecurity/lib-stable/fs/safe'
import {
  fetchConsumerUsageAggregate,
  inspectUsageManifest,
} from '../../../../scripts/repo/consumer-usage/registry.mts'
import { sha256Hex } from '../../../../scripts/repo/bootstrap/fleet.mjs'
import type { GhcrHttpGetFn } from '../../../../scripts/repo/bootstrap/fleet.mjs'
import { makeUsageFixture, USAGE_NOW } from './fixture.mts'

const roots: string[] = []
afterEach(() => {
  vi.unstubAllEnvs()
  for (const root of roots.splice(0)) safeDeleteSync(root)
})

function transportFixture(change?: 'immutable' | 'blob' | 'header') {
  const { root, verified } = makeUsageFixture()
  roots.push(root)
  const httpFn = vi.fn<GhcrHttpGetFn>(async url => {
    if (url.includes('/token?'))
      return {
        status: 200,
        headers: {},
        body: Buffer.from(JSON.stringify({ token: 'YOUR_OCI_PULL_TOKEN' })),
      }
    if (url.includes('/blobs/'))
      return {
        status: 200,
        headers: {},
        body: change === 'blob' ? Buffer.from('tampered') : verified.bytes,
      }
    let body = verified.manifestBytes
    if (change === 'immutable' && !url.endsWith('/green'))
      body = Buffer.from(`${body.toString()}\n`)
    return {
      status: 200,
      headers: {
        'docker-content-digest':
          change === 'header'
            ? `sha256:${'c'.repeat(64)}`
            : `sha256:${sha256Hex(body)}`,
      },
      body,
    }
  })
  return { root, verified, httpFn }
}

test('downloads anonymously and verifies the sources-bound immutable artifact', async () => {
  vi.stubEnv('GH_TOKEN', 'YOUR_GITHUB_TOKEN')
  const { root, verified, httpFn } = transportFixture()
  const result = await fetchConsumerUsageAggregate(root, {
    httpFn,
    now: USAGE_NOW,
  })
  expect(result).toEqual(verified)
  expect(httpFn.mock.calls[0]?.[1]).toBeUndefined()
  expect(httpFn.mock.calls.map(call => call[0])).toContain(
    `https://ghcr.io/v2/socketdev/socket-wheelhouse-lib-usage/manifests/lib-usage-${'a'.repeat(40)}-${'b'.repeat(64)}`,
  )
  expect(JSON.stringify(httpFn.mock.calls)).not.toContain('YOUR_GITHUB_TOKEN')
})

test.each(['immutable', 'blob', 'header'] as const)(
  'rejects changed %s bytes or digest',
  async change => {
    const { root, httpFn } = transportFixture(change)
    await expect(
      fetchConsumerUsageAggregate(root, { httpFn, now: USAGE_NOW }),
    ).rejects.toThrow()
  },
)

test.each([
  { artifactType: 'application/octet-stream' },
  { layers: [] },
  { manifests: [] },
  { annotations: {} },
])('rejects invalid artifact identity %j', change => {
  const { root, verified } = makeUsageFixture()
  roots.push(root)
  const manifest = JSON.parse(verified.manifestBytes.toString())
  expect(() =>
    inspectUsageManifest(
      Buffer.from(JSON.stringify({ ...manifest, ...change })),
    ),
  ).toThrow()
})
