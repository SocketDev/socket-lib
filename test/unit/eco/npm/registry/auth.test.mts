/**
 * @file Unit tests for the npm 2FA/OTP extension point. Every challenge here
 *   is built from the payload npm's pinned OpenAPI source documents, and every
 *   adapter is injected, so the suite runs with no network and no driver.
 */

import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import {
  applyNpmAuthAnswer,
  npmChallengeBody,
  npmHeaderValue,
  npmWebAuthHeaders,
  parseNpmAuthChallenge,
  sendWithNpmAuthRetry,
} from '../../../../../src/eco/npm/registry/auth.mjs'

import type {
  NpmAuthAnswer,
  NpmAuthChallenge,
} from '../../../../../src/eco/npm/registry/auth.mjs'

/**
 * The exact web-auth payload npm's spec carries as its `web_auth_flow`
 * example, down to the placeholder uuid.
 */
const WEB_AUTH_BODY = {
  authUrl:
    'https://www.npmjs.com/auth/cli/00000000-0000-0000-0000-000000000000',
  doneUrl:
    'https://registry.npmjs.org/-/v1/done?authId=00000000-0000-0000-0000-000000000000',
}

/**
 * A thrown adapter error shaped like the ones `http-request` raises: a status
 * plus a response carrying headers and a decodable body.
 */
function httpError(
  status: number,
  body?: unknown | undefined,
  headers?: Record<string, unknown> | undefined,
): Error {
  const text = body === undefined ? '' : JSON.stringify(body)
  return Object.assign(new Error('boom'), {
    response: {
      headers: headers ?? {},
      json: () => JSON.parse(text) as unknown,
      status,
      text: () => text,
    },
  })
}

describe('parseNpmAuthChallenge', () => {
  test('reads the web-auth flow payload as a "web-otp" challenge', () => {
    const challenge = parseNpmAuthChallenge(httpError(401, WEB_AUTH_BODY))
    assert.equal(challenge?.kind, 'web-otp')
    assert.equal(challenge?.authUrl, WEB_AUTH_BODY.authUrl)
    assert.equal(challenge?.doneUrl, WEB_AUTH_BODY.doneUrl)
    assert.equal(challenge?.status, 401)
  })

  test("needs BOTH urls, matching the spec's required pair", () => {
    // `required: [authUrl, doneUrl]` on that variant. One alone is not the
    // polling payload, so it must not be reported as one.
    const challenge = parseNpmAuthChallenge(
      httpError(401, { authUrl: WEB_AUTH_BODY.authUrl }),
    )
    assert.equal(challenge?.kind, 'otp')
    assert.equal(challenge?.authUrl, undefined)
    assert.equal(challenge?.doneUrl, undefined)
  })

  test('normalizes the token routes\' "error" key into reason', () => {
    const challenge = parseNpmAuthChallenge(
      httpError(401, {
        error: 'A One Time Password (OTP) by email is required.',
      }),
    )
    assert.equal(challenge?.kind, 'otp')
    assert.equal(
      challenge?.reason,
      'A One Time Password (OTP) by email is required.',
    )
  })

  test('normalizes the stage and trust routes\' "message" key into reason', () => {
    const challenge = parseNpmAuthChallenge(
      httpError(401, { message: 'Unauthorized' }),
    )
    assert.equal(challenge?.reason, 'Unauthorized')
  })

  test('carries the npm-notice and www-authenticate headers', () => {
    const challenge = parseNpmAuthChallenge(
      httpError(
        401,
        { error: 'You must provide a one-time pass.' },
        {
          'npm-notice':
            'Open https://www.npmjs.com/login/00000000-0000-0000-0000-000000000000 to use your security key for authentication',
          'www-authenticate': 'OTP',
        },
      ),
    )
    assert.equal(challenge?.wwwAuthenticate, 'OTP')
    assert.match(challenge?.notice ?? '', /security key/)
  })

  test('ignores a 403, which no OTP can satisfy', () => {
    // npm refuses a bypass_2fa granular token for governance writes whatever
    // code accompanies it, so retrying would only burn a code.
    assert.equal(
      parseNpmAuthChallenge(httpError(403, { error: 'nope' })),
      undefined,
    )
  })

  test('ignores a non-401 status and a status-less transport failure', () => {
    assert.equal(parseNpmAuthChallenge(httpError(500)), undefined)
    assert.equal(parseNpmAuthChallenge(new Error('socket hang up')), undefined)
    assert.equal(parseNpmAuthChallenge(undefined), undefined)
  })

  test('still reports a challenge when a minimal adapter attaches no response', () => {
    const challenge = parseNpmAuthChallenge(
      Object.assign(new Error('boom'), { status: 401 }),
    )
    assert.equal(challenge?.kind, 'otp')
    assert.equal(challenge?.reason, undefined)
    assert.equal(challenge?.notice, undefined)
  })

  test('survives an undecodable body rather than throwing over the failure', () => {
    const challenge = parseNpmAuthChallenge(
      Object.assign(new Error('boom'), {
        response: {
          headers: {},
          json: () => {
            throw new SyntaxError('not json')
          },
          status: 401,
          text: () => '<html>gateway</html>',
        },
      }),
    )
    assert.equal(challenge?.kind, 'otp')
    assert.equal(challenge?.reason, undefined)
  })
})

describe('npmHeaderValue', () => {
  test('matches case-insensitively', () => {
    assert.equal(
      npmHeaderValue({ 'WWW-Authenticate': 'OTP' }, 'www-authenticate'),
      'OTP',
    )
  })

  test('joins a repeated header the way the fetch spec does', () => {
    assert.equal(
      npmHeaderValue({ 'npm-notice': ['a', 'b'] }, 'npm-notice'),
      'a, b',
    )
  })

  test('answers undefined for an absent, empty, or non-string header', () => {
    assert.equal(npmHeaderValue({ other: 'x' }, 'npm-notice'), undefined)
    assert.equal(npmHeaderValue({ 'npm-notice': [] }, 'npm-notice'), undefined)
    assert.equal(npmHeaderValue({ 'npm-notice': 7 }, 'npm-notice'), undefined)
    assert.equal(npmHeaderValue(undefined, 'npm-notice'), undefined)
  })
})

describe('npmChallengeBody', () => {
  test('falls back to text when the response has no json method', () => {
    assert.deepEqual(npmChallengeBody({ text: () => '{"error":"x"}' }), {
      error: 'x',
    })
  })

  test('answers undefined for a non-object, a bodyless response, and JSON scalars', () => {
    assert.equal(npmChallengeBody(undefined), undefined)
    assert.equal(npmChallengeBody({}), undefined)
    assert.equal(npmChallengeBody({ text: () => '"a string"' }), undefined)
  })

  test('answers undefined when text itself is unparseable', () => {
    assert.equal(npmChallengeBody({ text: () => 'nope' }), undefined)
  })
})

describe('npmWebAuthHeaders', () => {
  test('is empty without a driver, so nothing about the request changes', () => {
    assert.deepEqual(npmWebAuthHeaders('stage'), {})
    assert.deepEqual(npmWebAuthHeaders('stage', {}), {})
  })

  test('opts into the web flow when a driver is present', () => {
    assert.deepEqual(
      npmWebAuthHeaders('trust', { onAuth: async () => undefined }),
      {
        'npm-auth-type': 'web',
        'npm-command': 'trust',
      },
    )
  })
})

describe('applyNpmAuthAnswer', () => {
  test("sets npm-otp and leaves the caller's object untouched", () => {
    const headers = { authorization: 'Bearer original' }
    const next = applyNpmAuthAnswer(headers, { otp: '123456' })
    assert.equal(next['npm-otp'], '123456')
    assert.equal(next['authorization'], 'Bearer original')
    assert.equal(headers['npm-otp' as keyof typeof headers], undefined)
  })

  test('replaces the bearer credential when the driver returns a token', () => {
    const next = applyNpmAuthAnswer(
      { authorization: 'Bearer original' },
      {
        token: 'fresh',
      },
    )
    assert.equal(next['authorization'], 'Bearer fresh')
  })

  test('starts from nothing when there were no headers', () => {
    assert.deepEqual(applyNpmAuthAnswer(undefined, { otp: '1' }), {
      'npm-otp': '1',
    })
  })
})

describe('sendWithNpmAuthRetry', () => {
  /**
   * A `send` that throws the given challenge on its first call and succeeds
   * afterwards, recording the headers it was handed each time.
   */
  function challengingSend(body: unknown = WEB_AUTH_BODY) {
    const seen: Array<Record<string, string> | undefined> = []
    const send = async (headers: Record<string, string> | undefined) => {
      seen.push(headers)
      if (seen.length === 1) {
        throw httpError(401, body)
      }
      return 'ok'
    }
    return { seen, send }
  }

  test('without a callback the challenge is just a failure, asked once', async () => {
    const { seen, send } = challengingSend()
    await assert.rejects(
      sendWithNpmAuthRetry(send, { authorization: 'Bearer t' }),
    )
    assert.equal(seen.length, 1)
  })

  test('without a callback nothing is added to the headers', async () => {
    const seen: Array<Record<string, string> | undefined> = []
    await sendWithNpmAuthRetry(
      async headers => {
        seen.push(headers)
        return 'ok'
      },
      { authorization: 'Bearer t' },
    )
    assert.deepEqual(seen, [{ authorization: 'Bearer t' }])
  })

  test("retries exactly once with the driver's answer", async () => {
    const { seen, send } = challengingSend()
    const asked: NpmAuthChallenge[] = []
    const result = await sendWithNpmAuthRetry(
      send,
      { authorization: 'Bearer t' },
      {
        async onAuth(challenge) {
          asked.push(challenge)
          return { otp: '654321' }
        },
      },
    )
    assert.equal(result, 'ok')
    assert.equal(seen.length, 2)
    assert.equal(seen[1]?.['npm-otp'], '654321')
    assert.equal(asked.length, 1)
    assert.equal(asked[0]?.kind, 'web-otp')
  })

  test('never loops: a second challenge is surfaced, not re-answered', async () => {
    let calls = 0
    let asks = 0
    await assert.rejects(
      sendWithNpmAuthRetry(
        async () => {
          calls += 1
          throw httpError(401, WEB_AUTH_BODY)
        },
        {},
        {
          async onAuth() {
            asks += 1
            return { otp: '000000' }
          },
        },
      ),
    )
    assert.equal(calls, 2)
    assert.equal(asks, 1)
  })

  test("a driver that declines surfaces the registry's original failure", async () => {
    const { seen, send } = challengingSend()
    await assert.rejects(
      sendWithNpmAuthRetry(send, {}, { onAuth: async () => undefined }),
      /boom/,
    )
    assert.equal(seen.length, 1)
  })

  test('an answer with neither otp nor token counts as declining', async () => {
    const { seen, send } = challengingSend()
    await assert.rejects(
      sendWithNpmAuthRetry(
        send,
        {},
        { onAuth: async () => ({}) as NpmAuthAnswer },
      ),
    )
    assert.equal(seen.length, 1)
  })

  test("a driver that throws surfaces the registry's original failure", async () => {
    const { seen, send } = challengingSend()
    await assert.rejects(
      sendWithNpmAuthRetry(
        send,
        {},
        {
          onAuth: async () => {
            throw new Error('touch id denied')
          },
        },
      ),
      /boom/,
    )
    assert.equal(seen.length, 1)
  })

  test('a non-challenge failure never reaches the driver', async () => {
    let asked = 0
    await assert.rejects(
      sendWithNpmAuthRetry(
        async () => {
          throw httpError(500)
        },
        {},
        {
          async onAuth() {
            asked += 1
            return { otp: '1' }
          },
        },
      ),
    )
    assert.equal(asked, 0)
  })

  test('a token answer re-authenticates the retry', async () => {
    const { seen, send } = challengingSend()
    await sendWithNpmAuthRetry(
      send,
      { authorization: 'Bearer stale' },
      { onAuth: async () => ({ token: 'fresh' }) },
    )
    assert.equal(seen[1]?.['authorization'], 'Bearer fresh')
  })
})
