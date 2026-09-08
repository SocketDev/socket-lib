import assert from 'node:assert/strict'
import { describe, test } from 'vitest'
import {
  addTrustedPublishers,
  deleteTrustedPublisher,
  fetchTrustedPublishers,
} from '../../../../../src/eco/npm/registry/trust.mjs'
import {
  challengingHttp,
  DRIVER_OTP,
  testAuthRoutes,
} from './auth-challenges.mjs'

describe('trust onAuth callbacks', () => {
  testAuthRoutes([
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
  ])
  test('a cache handed to an onAuth call is never even consulted', async () => {
    let touched = 0
    const spyCache = {
      async get() {
        touched += 1
        return undefined
      },
      async getOrFetch<T>(key: string, fetcher: () => Promise<T>) {
        void key
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
