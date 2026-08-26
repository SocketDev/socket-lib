/**
 * @file Unit tests for the endpoints that route through the `onAuth`
 *   callback.
 *   npm's pinned OpenAPI source marks exactly seven operations with an
 *   `npm-otp` header parameter, and these are those seven. Also the hygiene
 *   test: an answer a driver hands back must not survive the call, in a cache
 *   or anywhere else.
 */

import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import { createBrowserTtlCache } from '../../../../src/cache/ttl/browser.mjs'
import {
  approveStagedVersion,
  deleteStagedVersion,
} from '../../../../src/npm/registry/stage-actions.mjs'
import {
  createNpmToken,
  deleteNpmToken,
} from '../../../../src/npm/registry/tokens.mjs'
import {
  addTrustedPublishers,
  deleteTrustedPublisher,
  fetchTrustedPublishers,
} from '../../../../src/npm/registry/trust.mjs'

import type { NpmOnAuth } from '../../../../src/npm/registry/auth.mjs'

/**
 * The one-time password a driver hands back. Distinctive enough that a search
 * for it across everything the call touched is meaningful.
 */
const DRIVER_OTP = '867530912345'

/**
 * The web-auth payload npm answers a 2FA account with when `npm-otp` is
 * omitted and the web headers are present.
 */
const WEB_AUTH_BODY = {
  authUrl:
    'https://www.npmjs.com/auth/cli/00000000-0000-0000-0000-000000000000',
  doneUrl:
    'https://registry.npmjs.org/-/v1/done?authId=00000000-0000-0000-0000-000000000000',
}

/**
 * An adapter that answers every first request with npm's 401 challenge and
 * every later one with `payload`, recording each request it was handed.
 */
function challengingHttp(payload: unknown = {}) {
  const calls: Array<{
    headers?: Record<string, string> | undefined
    url: string
  }> = []
  const answer = <T,>(
    url: string,
    init?: { headers?: Record<string, string> | undefined } | undefined,
  ): T => {
    calls.push({ headers: init?.headers, url })
    if (calls.length === 1) {
      const text = JSON.stringify(WEB_AUTH_BODY)
      throw Object.assign(new Error('boom'), {
        response: {
          headers: {},
          json: () => JSON.parse(text),
          status: 401,
          text: () => text,
        },
      })
    }
    return payload as T
  }
  return {
    calls,
    http: {
      async bytes(url: string, init?: never | undefined): Promise<Uint8Array> {
        answer(url, init)
        return new Uint8Array(0)
      },
      async json<T>(url: string, init?: never | undefined): Promise<T> {
        return answer<T>(url, init)
      },
      async text(url: string, init?: never | undefined): Promise<string> {
        answer(url, init)
        return ''
      },
    },
  }
}

/**
 * Every OTP-gated operation, invoked with one options bag.
 */
const OTP_GATED = [
  {
    call: async (options: never) =>
      await approveStagedVersion('stage-1', options),
    command: 'stage',
    name: 'POST /-/stage/{stage-id}/approve',
  },
  {
    call: async (options: never) =>
      await deleteStagedVersion('stage-1', options),
    command: 'stage',
    name: 'DELETE /-/stage/{stage-id}',
  },
  {
    call: async (options: never) =>
      await createNpmToken({ name: 'ci', password: 'pw' }, options),
    command: 'token',
    name: 'POST /-/npm/v1/tokens',
  },
  {
    call: async (options: never) => await deleteNpmToken('npm_abc', options),
    command: 'token',
    name: 'DELETE /-/npm/v1/tokens/token/{token}',
  },
  {
    call: async (options: never) =>
      await fetchTrustedPublishers('@example/pkg', options),
    command: 'trust',
    name: 'GET /-/package/{package}/trust',
  },
  {
    call: async (options: never) =>
      await addTrustedPublishers(
        '@example/pkg',
        [{ claims: {}, permissions: ['createPackage'], type: 'github' }],
        options,
      ),
    command: 'trust',
    name: 'POST /-/package/{package}/trust',
  },
  {
    call: async (options: never) =>
      await deleteTrustedPublisher('@example/pkg', 'config-1', options),
    command: 'trust',
    name: 'DELETE /-/package/{package}/trust/{config-uuid}',
  },
] as const

describe('the onAuth callback across every OTP-gated endpoint', () => {
  for (const route of OTP_GATED) {
    test(`${route.name} answers a challenge and retries once`, async () => {
      const { calls, http } = challengingHttp([])
      const onAuth: NpmOnAuth = async () => ({ otp: DRIVER_OTP })
      await route.call({ http, onAuth, token: 'tok' } as never)
      assert.equal(calls.length, 2)
      assert.equal(calls[0]?.headers?.['npm-auth-type'], 'web')
      assert.equal(calls[0]?.headers?.['npm-command'], route.command)
      assert.equal(calls[0]?.headers?.['npm-otp'], undefined)
      assert.equal(calls[1]?.headers?.['npm-otp'], DRIVER_OTP)
    })

    test(`${route.name} is unchanged without a driver`, async () => {
      const { calls, http } = challengingHttp([])
      await route.call({ http, token: 'tok' } as never)
      assert.equal(calls.length, 1)
      assert.equal(calls[0]?.headers?.['npm-auth-type'], undefined)
      assert.equal(calls[0]?.headers?.['npm-otp'], undefined)
    })
  }

  test('a declining driver stops after the first attempt everywhere', async () => {
    for (const route of OTP_GATED) {
      const { calls, http } = challengingHttp([])
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await route.call({
        http,
        onAuth: async () => undefined,
        token: 'tok',
      } as never)
      assert.equal(calls.length, 1, route.name)
    }
  })

  test('a throwing driver stops after the first attempt everywhere', async () => {
    for (const route of OTP_GATED) {
      const { calls, http } = challengingHttp([])
      const onAuth: NpmOnAuth = async () => {
        throw new Error('touch id denied')
      }
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await route.call({ http, onAuth, token: 'tok' } as never)
      assert.equal(calls.length, 1, route.name)
    }
  })
})

describe('an onAuth answer is never persisted', () => {
  test('the OTP reaches exactly one request header and nothing else', async () => {
    const cache = createBrowserTtlCache({
      prefix: 'test-otp-leak',
      ttl: 60_000,
    })
    const { calls, http } = challengingHttp({ message: 'approved' })
    const result = await approveStagedVersion('stage-1', {
      cache,
      http,
      onAuth: async () => ({ otp: DRIVER_OTP }),
      token: 'tok',
    } as never)

    // The retry carried it, the first attempt did not, and the caller's own
    // options bag was never mutated to hold it.
    assert.equal(calls[1]?.headers?.['npm-otp'], DRIVER_OTP)
    assert.equal(JSON.stringify(calls[0]).includes(DRIVER_OTP), false)

    // Nothing the endpoint returns carries it back out.
    assert.equal(JSON.stringify(result).includes(DRIVER_OTP), false)

    // And nothing was written to the cache: not under a key naming the OTP,
    // and not under any key at all.
    assert.equal(await cache.get(DRIVER_OTP), undefined)
    assert.equal(await cache.get('stage-1'), undefined)
  })

  test('a cache handed to an onAuth call is never even consulted', async () => {
    let touched = 0
    const spyCache = {
      async get() {
        touched += 1
        return undefined
      },
      async getOrFetch<T>(_key: string, fetcher: () => Promise<T>) {
        touched += 1
        return await fetcher()
      },
      async set() {
        touched += 1
      },
    }
    const { http } = challengingHttp([])
    await fetchTrustedPublishers('@example/pkg', {
      cache: spyCache,
      http,
      onAuth: async () => ({ otp: DRIVER_OTP }),
      token: 'tok',
    } as never)
    assert.equal(touched, 0)
  })
})
