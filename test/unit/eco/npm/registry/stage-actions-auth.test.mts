import assert from 'node:assert/strict'
import { describe, test } from 'vitest'
import {
  approveStagedVersion,
  deleteStagedVersion,
} from '../../../../../src/eco/npm/registry/stage-actions.mjs'
import {
  challengingHttp,
  DRIVER_OTP,
  testAuthRoutes,
} from './auth-challenges.mjs'
import { createBrowserTtlCache } from '../../../../../src/cache/ttl/browser.mjs'

describe('stage-actions onAuth callbacks', () => {
  testAuthRoutes([
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
  ])
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
})
