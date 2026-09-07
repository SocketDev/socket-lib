import assert from 'node:assert/strict'
import { test } from 'vitest'
import type { NpmOnAuth } from '../../../../../src/eco/npm/registry/auth.mjs'

/**
 * The one-time password a driver hands back. Distinctive enough that a search
 * for it across everything the call touched is meaningful.
 */
export const DRIVER_OTP = '867530912345'

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
export function challengingHttp(payload: unknown = {}) {
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

export function testAuthRoutes(
  routes: ReadonlyArray<{
    call: (options: never) => Promise<unknown>
    command: string
    name: string
  }>,
): void {
  for (
    let routeIndex = 0, routeCount = routes.length;
    routeIndex < routeCount;
    routeIndex++
  ) {
    const route = routes[routeIndex]!
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
    for (
      let routeIndex = 0, routeCount = routes.length;
      routeIndex < routeCount;
      routeIndex++
    ) {
      const route = routes[routeIndex]!
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
    for (
      let routeIndex = 0, routeCount = routes.length;
      routeIndex < routeCount;
      routeIndex++
    ) {
      const route = routes[routeIndex]!
      const { calls, http } = challengingHttp([])
      const onAuth: NpmOnAuth = async () => {
        throw new Error('touch id denied')
      }
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await route.call({ http, onAuth, token: 'tok' } as never)
      assert.equal(calls.length, 1, route.name)
    }
  })
}
