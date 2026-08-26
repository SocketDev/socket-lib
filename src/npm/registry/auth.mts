/**
 * @file The 2FA/OTP extension point for the authenticated npm registry API.
 *   Several npm writes answer `401` with a CHALLENGE instead of a result, and
 *   the only way past it is a one-time password the caller does not have when
 *   it makes the call. This module defines the callback that lets an external
 *   driver answer that challenge, and defines nothing else: socket-lib owns the
 *   CONTRACT and never imports a driver, per the gated-extension-point
 *   doctrine. `onAuth` is an options-bag callback, so a caller that supplies
 *   none gets exactly the behaviour it got before this file existed. Every
 *   shape here was read off npm's pinned OpenAPI source, not invented. See
 *   `scripts/repo/npm-api-spec/spec-pin.json` for the commit, and the
 *   `UnauthorizedWithWebAuthn` response in `api/shared-components.yaml` plus
 *   the `"401"` response on `POST /-/npm/v1/tokens` in
 *   `api/registry.npmjs.com/token.yaml` for the payload itself.
 */

import { httpErrorStatus } from './live.mjs'

/**
 * The `npm-command` value naming the operation being authenticated.
 *
 * Npm returns the web-auth challenge only when `npm-command` and
 * `npm-auth-type: web` are BOTH present, and its spec enumerates exactly these
 * three values, one per family of OTP-gated route.
 */
export type NpmAuthCommand = 'stage' | 'token' | 'trust'

/**
 * What a driver hands back to satisfy a challenge.
 *
 * `otp` becomes the `npm-otp` header on the retry. npm's spec describes three
 * ways one is obtained: the account's configured 2FA method, an 8-digit code
 * emailed to accounts without 2FA, and a 16-digit code returned by polling
 * `doneUrl` after a hardware key authenticates.
 *
 * `token` replaces the bearer credential on the retry, for a driver that
 * completes a web login and comes back with a fresh token rather than a code.
 * Returning neither is the same as declining.
 */
export interface NpmAuthAnswer {
  readonly otp?: string | undefined
  readonly token?: string | undefined
}

/**
 * A parsed npm authentication challenge.
 *
 * `kind` is `web-otp` only when npm returned BOTH `authUrl` and `doneUrl`,
 * which its spec marks `required: [authUrl, doneUrl]` on that variant. That
 * pair is the "2FA polling payload": `authUrl` is opened in a browser and
 * `doneUrl` is polled until it yields the code.
 *
 * Everything else is `otp`, covering the plain "OTP required" refusal and the
 * legacy WebAuthn notice older clients get.
 */
export interface NpmAuthChallenge {
  readonly authUrl?: string | undefined
  readonly doneUrl?: string | undefined
  readonly kind: 'otp' | 'web-otp'
  /**
   * The `npm-notice` header. npm sends a security-key URL here when 2FA is on
   * and the web-auth headers were absent.
   */
  readonly notice?: string | undefined
  /**
   * Npm's own explanation, normalized from the payload's `error` or `message`
   * key. The token routes spell it `error`, the stage and trust routes spell
   * it `message`, and they mean the same thing.
   */
  readonly reason?: string | undefined
  readonly status: number
  /**
   * The `www-authenticate` header, which npm sets to `OTP` when a one-time
   * password is what is missing.
   */
  readonly wwwAuthenticate?: string | undefined
}

/**
 * Answer an npm authentication challenge, or return undefined to decline.
 *
 * TWO DRIVERS ARE INTENDED, and neither is a dependency of this package.
 *
 * A BROWSER DRIVER (Playwright or similar) logs into npmjs.com and drives the
 * web 2FA flow: it opens `challenge.authUrl`, completes the prompt, then polls
 * `challenge.doneUrl` for the code. Such a driver can also source the value
 * from an already-authenticated npmjs.com session, because the site
 * accumulates its state into a `window.__context__` object that a page script
 * can read.
 *
 * A SECRET-BRIDGE DRIVER such as sockeye holds credentials in the OS keychain
 * and releases them only to one approved child process. This callback is
 * async and returns a value, so such a driver spawns its child, waits for the
 * human approval, and resolves with what the child produced.
 */
export type NpmOnAuth = (
  challenge: NpmAuthChallenge,
) => Promise<NpmAuthAnswer | undefined>

/**
 * The options-bag opt-in. Absent `onAuth`, every code path here is a no-op.
 */
export interface NpmAuthRetryOptions {
  onAuth?: NpmOnAuth | undefined
}

/**
 * Merge an answer into the request headers for the retry.
 *
 * Returns a fresh object rather than mutating, so the caller's headers are
 * never left holding a secret after the retry completes.
 */
export function applyNpmAuthAnswer(
  headers: Record<string, string> | undefined,
  answer: NpmAuthAnswer,
): Record<string, string> {
  const next: Record<string, string> = { ...headers }
  if (answer.token) {
    next['authorization'] = `Bearer ${answer.token}`
  }
  if (answer.otp) {
    next['npm-otp'] = answer.otp
  }
  return next
}

/**
 * The decoded JSON body of a failed response, or undefined when there is none
 * to read.
 *
 * Tolerant on purpose. `NpmHttpAdapter` only promises that a thrown error
 * carries a status, so a minimal adapter may attach no response at all, and a
 * challenge parse must degrade to "no body" rather than throw a second error
 * on top of the first.
 */
export function npmChallengeBody(
  response: unknown,
): Record<string, unknown> | undefined {
  if (response === null || typeof response !== 'object') {
    return undefined
  }
  const source = response as {
    json?: unknown | undefined
    text?: unknown | undefined
  }
  let parsed: unknown
  if (typeof source.json === 'function') {
    try {
      parsed = (source as { json(): unknown }).json()
    } catch {
      parsed = undefined
    }
  }
  if (parsed === undefined && typeof source.text === 'function') {
    try {
      parsed = JSON.parse((source as { text(): string }).text())
    } catch {
      parsed = undefined
    }
  }
  return typeof parsed === 'object' && parsed !== null
    ? (parsed as Record<string, unknown>)
    : undefined
}

/**
 * One header value, looked up case-insensitively.
 *
 * The Node adapter hands back `IncomingHttpHeaders`, whose values may be
 * arrays, while the browser adapter hands back a flat string record. Both are
 * accepted so the same parse serves either.
 */
export function npmHeaderValue(
  headers: unknown,
  name: string,
): string | undefined {
  if (headers === null || typeof headers !== 'object') {
    return undefined
  }
  const bag = headers as Record<string, unknown>
  const keys = Object.keys(bag)
  for (let i = 0, { length } = keys; i < length; i += 1) {
    const key = keys[i]!
    if (key.toLowerCase() !== name) {
      continue
    }
    const value = bag[key]
    if (typeof value === 'string') {
      return value
    }
    if (Array.isArray(value)) {
      const joined = value.filter(part => typeof part === 'string').join(', ')
      return joined || undefined
    }
    return undefined
  }
  return undefined
}

/**
 * The headers that opt a request into npm's web authentication flow.
 *
 * Empty without `onAuth`, which is what keeps a caller that supplies no driver
 * byte-identical to before. npm only answers with `authUrl`/`doneUrl` when
 * `npm-auth-type: web` and `npm-command` are both sent, so asking for a
 * challenge we cannot answer would only make the failure less clear.
 */
export function npmWebAuthHeaders(
  command: NpmAuthCommand,
  options?: NpmAuthRetryOptions | undefined,
): Record<string, string> {
  const opts = { __proto__: null, ...options } as NpmAuthRetryOptions
  if (opts.onAuth === undefined) {
    return {}
  }
  return { 'npm-auth-type': 'web', 'npm-command': command }
}

/**
 * Read an npm authentication challenge off a thrown adapter error, or return
 * undefined when the failure is not a challenge.
 *
 * Only `401` qualifies. npm's spec puts every OTP challenge there, and the
 * neighbouring `403` is the opposite case: a granular access token created
 * with `bypass_2fa` is refused for governance writes no matter what OTP
 * accompanies it, so retrying that one with a fresh code just burns a code.
 */
export function parseNpmAuthChallenge(
  e: unknown,
): NpmAuthChallenge | undefined {
  const status = httpErrorStatus(e)
  if (status !== 401) {
    return undefined
  }
  // `e` is necessarily a non-null object here: `httpErrorStatus` answers
  // undefined for anything else, and that already returned above.
  const { response } = e as { response?: unknown | undefined }
  const headers = (response as { headers?: unknown | undefined } | undefined)
    ?.headers
  const body = npmChallengeBody(response)
  const authUrl = body?.['authUrl']
  const doneUrl = body?.['doneUrl']
  const hasWebFlow = typeof authUrl === 'string' && typeof doneUrl === 'string'
  const error = body?.['error']
  const message = body?.['message']
  const reason =
    typeof error === 'string'
      ? error
      : typeof message === 'string'
        ? message
        : undefined
  return {
    authUrl: hasWebFlow ? (authUrl as string) : undefined,
    doneUrl: hasWebFlow ? (doneUrl as string) : undefined,
    kind: hasWebFlow ? 'web-otp' : 'otp',
    notice: npmHeaderValue(headers, 'npm-notice'),
    reason,
    status,
    wwwAuthenticate: npmHeaderValue(headers, 'www-authenticate'),
  }
}

/**
 * Run a request, and on an npm authentication challenge run it ONCE more with
 * whatever `onAuth` answered.
 *
 * Exactly one retry, never a loop: an OTP that npm rejects is not going to be
 * accepted on the third try, and a driver that can be re-invoked without limit
 * is a driver that can lock an account out. Any other failure, a decline, and
 * a driver that throws all surface the registry's ORIGINAL error, because that
 * is the half of the story a caller can act on.
 */
export async function sendWithNpmAuthRetry<T>(
  send: (headers: Record<string, string> | undefined) => Promise<T>,
  headers: Record<string, string> | undefined,
  options?: NpmAuthRetryOptions | undefined,
): Promise<T> {
  const opts = { __proto__: null, ...options } as NpmAuthRetryOptions
  const { onAuth } = opts
  if (onAuth === undefined) {
    return await send(headers)
  }
  let challenge: NpmAuthChallenge | undefined
  try {
    return await send(headers)
  } catch (e) {
    challenge = parseNpmAuthChallenge(e)
    if (challenge === undefined) {
      throw e
    }
    let answer: NpmAuthAnswer | undefined
    try {
      answer = await onAuth(challenge)
    } catch {
      // A driver that fails is a driver that could not answer. The registry's
      // refusal is the actionable error, so it is what propagates.
      throw e
    }
    if (answer === undefined || (!answer.otp && !answer.token)) {
      throw e
    }
    return await send(applyNpmAuthAnswer(headers, answer))
  }
}
