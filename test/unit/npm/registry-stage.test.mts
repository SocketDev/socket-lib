/**
 * @file Unit tests for the npm staging and version-status reads. The HTTP
 *   adapter is injected, so every case runs with no network.
 */

import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import {
  fetchStagedVersions,
  fetchVersionStatus,
  findStagedVersion,
  isPendingStatus,
} from '../../../src/npm/registry-stage.mjs'

/**
 * An adapter that answers `payload` for any URL, recording what it was asked.
 */
function stubHttp(payload: unknown) {
  const calls: Array<{
    headers?: Record<string, string> | undefined
    url: string
  }> = []
  return {
    calls,
    http: {
      async json<T>(
        url: string,
        init?: { headers?: Record<string, string> | undefined } | undefined,
      ): Promise<T> {
        calls.push({ headers: init?.headers, url })
        return payload as T
      },
    },
  }
}

/**
 * An adapter that always rejects, with an optional HTTP status.
 */
function failingHttp(status?: number | undefined) {
  return {
    http: {
      async json<T>(): Promise<T> {
        throw Object.assign(new Error('boom'), status ? { status } : {})
      },
    },
  }
}

const STAGED_ITEM = {
  access: 'public',
  actor: 'octocat',
  actorType: 'user',
  createdAt: '2026-03-16T09:00:00.000Z',
  id: '1de6f3db-2ed9-4d72-b3dd-8f0e2b474a2f',
  packageName: '@example/pkg',
  shasum: '4f7f5f1d5bcf2f72f6e4d6c4f3b2812d8a2f6c19',
  status: 'staged' as const,
  tag: 'next',
  version: '7.0.0-pre.1',
}

describe('fetchStagedVersions', () => {
  test('returns the staged items with their shasum', async () => {
    const stub = stubHttp({ items: [STAGED_ITEM], total: 1 })
    const read = await fetchStagedVersions({ ...stub, token: 'tok' })
    assert.equal(read.reachable, true)
    assert.equal(read.total, 1)
    assert.equal(read.items[0]!.shasum, STAGED_ITEM.shasum)
  })

  test('sends the bearer token', async () => {
    const stub = stubHttp({ items: [] })
    await fetchStagedVersions({ ...stub, token: 'tok' })
    assert.equal(stub.calls[0]!.headers?.['authorization'], 'Bearer tok')
  })

  test('escapes a scoped package name in the query', async () => {
    const stub = stubHttp({ items: [] })
    await fetchStagedVersions({
      ...stub,
      packageName: '@example/pkg',
      token: 'tok',
    })
    assert.match(
      stub.calls[0]!.url,
      /package=%40example%2Fpkg|package=@example%2Fpkg/,
    )
  })

  test('an unreachable registry is NOT an empty stage list', async () => {
    // "nothing is staged" and "I could not ask" are different facts, and a
    // pipeline must not act on the second as though it were the first.
    const read = await fetchStagedVersions({ ...failingHttp(), token: 'tok' })
    assert.equal(read.reachable, false)
    assert.deepEqual(read.items, [])
  })
})

describe('findStagedVersion', () => {
  test('finds the matching version', async () => {
    const stub = stubHttp({ items: [STAGED_ITEM] })
    const found = await findStagedVersion('@example/pkg', '7.0.0-pre.1', {
      ...stub,
      token: 'tok',
    })
    assert.equal(found?.id, STAGED_ITEM.id)
  })

  test('answers undefined when that version is not staged', async () => {
    const stub = stubHttp({ items: [STAGED_ITEM] })
    const found = await findStagedVersion('@example/pkg', '9.9.9', {
      ...stub,
      token: 'tok',
    })
    assert.equal(found, undefined)
  })

  test('answers undefined when the registry could not be asked', async () => {
    const found = await findStagedVersion('@example/pkg', '7.0.0-pre.1', {
      ...failingHttp(),
      token: 'tok',
    })
    assert.equal(found, undefined)
  })
})

describe('fetchVersionStatus', () => {
  test('reports the lifecycle status', async () => {
    const stub = stubHttp({ status: 'validating' })
    const read = await fetchVersionStatus('@example/pkg', '1.2.3', {
      ...stub,
      token: 'tok',
    })
    assert.equal(read.status, 'validating')
    assert.equal(read.reachable, true)
  })

  test('a 404 is reachable-with-no-status, not a failure', async () => {
    // The registry returns 404 for both "does not exist" and "you cannot see
    // it", deliberately indistinguishable, so neither is worth retrying.
    const read = await fetchVersionStatus('@example/pkg', '1.2.3', {
      ...failingHttp(404),
      token: 'tok',
    })
    assert.equal(read.reachable, true)
    assert.equal(read.status, undefined)
  })

  test('a real transport failure is unreachable', async () => {
    const read = await fetchVersionStatus('@example/pkg', '1.2.3', {
      ...failingHttp(),
      token: 'tok',
    })
    assert.equal(read.reachable, false)
  })
})

describe('isPendingStatus', () => {
  test('both waiting states are pending', () => {
    assert.equal(isPendingStatus('staged'), true)
    assert.equal(isPendingStatus('validating'), true)
  })

  test('blocked is NOT pending: it is a refusal, not a delay', () => {
    // A caller polling for "still working" would wait forever on it.
    assert.equal(isPendingStatus('blocked'), false)
  })

  test('published and deleted are settled', () => {
    assert.equal(isPendingStatus('published'), false)
    assert.equal(isPendingStatus('deleted'), false)
    assert.equal(isPendingStatus(undefined), false)
  })
})
