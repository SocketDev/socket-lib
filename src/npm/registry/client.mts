/**
 * @file Shared request primitives for the authenticated npm registry API.
 *   `./index` and `./live` cover the public, unauthenticated
 *   reads. The rest of the registry API (access, org, team, tokens, trust,
 *   publish, stage) also WRITES, and a write needs one thing the shared
 *   `NpmHttpAdapter` cannot express: a truthful answer for an endpoint that
 *   replies `204 No Content`. Hence the extra `text` method here. `json`
 *   decodes a JSON reply and throws on non-2xx; `bytes` carries an
 *   `application/octet-stream` body undecoded, which is what the staged
 *   tarball read needs; `text` returns the raw body, which is the only way to
 *   tell a successful empty 204 from a failure, because a JSON decoder handed
 *   an empty body throws exactly like a transport error does. All three are
 *   satisfied as-is by `{ bytes: httpBytes, json: httpJson, text: httpText }`
 *   from `@socketsecurity/lib/http-request` (Node) or `http-request/browser`,
 *   so this module stays browser-safe: no `node:*` builtin, no socket of its
 *   own.
 *   Reads and writes report differently ON PURPOSE. A read fails OPEN, adding
 *   `reachable: false` so a caller can never mistake "I could not ask" for
 *   "the answer is empty". A write fails CLOSED into an explicit
 *   `NpmWriteResult`: silently swallowing a failed mutation is how a pipeline
 *   reports success for something that never happened.
 */

import { sendWithNpmAuthRetry } from './auth.mjs'
import { httpErrorStatus } from './live.mjs'

import type { NpmAuthRetryOptions } from './auth.mjs'
import type { NpmHttpAdapter, NpmHttpInit } from './index.mjs'

export type { NpmHttpAdapter, NpmHttpInit } from './index.mjs'
export type {
  NpmAuthAnswer,
  NpmAuthChallenge,
  NpmAuthCommand,
  NpmAuthRetryOptions,
  NpmOnAuth,
} from './auth.mjs'

/**
 * The public npm registry. Every helper takes an optional `registry` override
 * so an enterprise mirror or a test server can be addressed instead.
 */
export const NPM_REGISTRY_URL = 'https://registry.npmjs.org'

/**
 * Credentials for an authenticated call.
 *
 * `otp` is a one-time password. Several npm endpoints demand one even when the
 * token itself is valid: token create/delete, staging delete/approve, and
 * every trusted-publisher route.
 *
 * `otp` is the answer supplied UP FRONT. `onAuth`, inherited from
 * `NpmAuthRetryOptions`, is the answer supplied ON DEMAND: when npm replies
 * with a 401 challenge, the callback is asked for a code and the request runs
 * once more. Supplying neither leaves the pre-`onAuth` behaviour untouched.
 */
export interface NpmAuthOptions extends NpmAuthRetryOptions {
  otp?: string | undefined
  registry?: string | undefined
  token: string
}

/**
 * Injectable HTTP adapter for the authenticated registry surface.
 *
 * `NpmHttpAdapter` from `./index` supplies `bytes` and `json`; `text` is
 * added here because only the authenticated surface writes, and only a write
 * needs to tell a successful empty `204 No Content` from a failure.
 *
 * Pass `{ bytes: httpBytes, json: httpJson, text: httpText }` from
 * `@socketsecurity/lib/http-request` in Node, or the same trio from
 * `@socketsecurity/lib/http-request/browser` in a browser or extension.
 * Every method must throw on a non-2xx status; the error only needs to carry
 * the status as `status` or `response.status`, which is what `httpErrorStatus`
 * reads.
 */
export interface NpmRegistryHttpOptions {
  http: NpmHttpAdapter & {
    text(url: string, init?: NpmHttpInit | undefined): Promise<string>
  }
}

/**
 * A write that did not happen. `status` is 0 when the registry was never
 * reached at all, which is distinct from any status it actually returned.
 */
export interface NpmWriteFailure {
  readonly cause?: string | undefined
  readonly error: string
  readonly status: number
  readonly success: false
}

/**
 * A write the registry accepted, carrying whatever it replied with.
 */
export interface NpmWriteSuccess<T> {
  readonly data: T
  readonly status: number
  readonly success: true
}

/**
 * The result of any mutation. Discriminated on `success`, mirroring
 * `SocketSdkResult` in socket-sdk-js so a caller moving between the two
 * clients branches the same way in both.
 */
export type NpmWriteResult<T> = NpmWriteFailure | NpmWriteSuccess<T>

/**
 * Build a query string from parameters, skipping any that are undefined.
 *
 * Returns the empty string when nothing survives, so a caller can append the
 * result unconditionally without ending up with a bare trailing `?`.
 */
export function buildQuery(
  params: Record<string, string | number | boolean | undefined>,
): string {
  const parts: string[] = []
  const keys = Object.keys(params)
  for (let i = 0, { length } = keys; i < length; i += 1) {
    const key = keys[i]!
    const value = params[key]
    if (value === undefined) {
      continue
    }
    parts.push(
      `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    )
  }
  return parts.length ? `?${parts.join('&')}` : ''
}

/**
 * A short, actionable hint for an npm status code, or undefined when the
 * status carries no npm-specific meaning worth explaining.
 *
 * The 403 wording matters most: npm returns it when a granular access token
 * created with `bypass_2fa: true` attempts a governance write. The token is
 * valid, so "unauthorized" reads as a lie, and a caller that retries with the
 * same token loops forever.
 */
export function describeNpmStatus(status: number): string | undefined {
  if (status === 401) {
    return 'Authentication failed. The token is missing, invalid, or expired.'
  }
  if (status === 403) {
    return 'Forbidden. A granular access token created with bypass_2fa cannot perform account, org, team, or package governance writes. Use an interactive 2FA challenge instead.'
  }
  if (status === 404) {
    return 'Not found. The resource does not exist, or the token cannot see it. npm reports both the same way on purpose.'
  }
  if (status === 409) {
    return 'Conflict. The resource already exists or changed underneath this request.'
  }
  if (status === 429) {
    return 'Rate limited. Back off before retrying.'
  }
  return undefined
}

/**
 * A registry read that answers with a name-to-value map, such as package
 * grants, collaborators, or org membership.
 */
export interface NpmRecordRead {
  readonly entries: Readonly<Record<string, string>>
  /**
   * False when the registry could not be asked. Distinct from an empty
   * `entries`, which means it answered and there is nothing there.
   */
  readonly reachable: boolean
}

/**
 * A registry read that answers with a flat list of names.
 */
export interface NpmStringListRead {
  readonly items: readonly string[]
  /**
   * False when the registry could not be asked. Distinct from an empty
   * `items`, which means it answered and there is nothing there.
   */
  readonly reachable: boolean
}

/**
 * Fail-open GET for an endpoint returning a name-to-value map.
 *
 * Every failure, including a 404, reports `reachable: false`. That is the
 * conservative reading for a permissions map: npm answers 404 both for "no
 * such org" and for "your token cannot see it", so treating the 404 as an
 * authoritative empty map would tell a caller that a team it simply cannot
 * read has no grants at all.
 */
export async function fetchRecord(
  url: string,
  options: NpmRegistryHttpOptions & NpmAuthOptions,
): Promise<NpmRecordRead> {
  const opts = { __proto__: null, ...options } as typeof options
  try {
    const json = await opts.http.json<Record<string, string> | undefined>(url, {
      headers: npmAuthHeaders(opts),
    })
    return {
      entries: typeof json === 'object' && json !== null ? json : {},
      reachable: true,
    }
  } catch {
    return { entries: {}, reachable: false }
  }
}

/**
 * Fail-open GET for an endpoint returning a flat list of names. Same
 * reachability contract as {@link fetchRecord}.
 */
export async function fetchStringList(
  url: string,
  options: NpmRegistryHttpOptions & NpmAuthOptions,
): Promise<NpmStringListRead> {
  const opts = { __proto__: null, ...options } as typeof options
  try {
    const json = await opts.http.json<unknown>(url, {
      headers: npmAuthHeaders(opts),
    })
    return {
      items: Array.isArray(json)
        ? json.filter((item): item is string => typeof item === 'string')
        : [],
      reachable: true,
    }
  } catch {
    return { items: [], reachable: false }
  }
}

/**
 * Request headers for an authenticated call.
 *
 * `npm-otp` is only sent when an OTP was supplied. Sending an empty one is
 * worse than sending none: npm treats the header as present and rejects the
 * request instead of running its normal no-OTP path.
 */
export function npmAuthHeaders(
  options: NpmAuthOptions,
): Record<string, string> {
  const opts = { __proto__: null, ...options } as NpmAuthOptions
  const headers: Record<string, string> = {
    authorization: `Bearer ${opts.token}`,
  }
  if (opts.otp) {
    headers['npm-otp'] = opts.otp
  }
  return headers
}

/**
 * The message an adapter error carries, or undefined when it has none.
 *
 * Structural rather than an `instanceof` check, because this module is
 * browser-safe and cannot import the Node error class, and because a
 * fetch-shaped adapter may throw something that is not an `Error` at all.
 */
export function npmErrorCause(e: unknown): string | undefined {
  if (e === null || typeof e !== 'object') {
    return typeof e === 'string' && e ? e : undefined
  }
  const { message } = e as { message?: unknown | undefined }
  return typeof message === 'string' && message ? message : undefined
}

/**
 * Normalize a registry base URL by dropping trailing slashes, so callers can
 * pass either spelling and every built URL has exactly one separator.
 */
export function resolveRegistry(registry?: string | undefined): string {
  const base = registry ?? NPM_REGISTRY_URL
  let end = base.length
  while (end > 0 && base[end - 1] === '/') {
    end -= 1
  }
  return base.slice(0, end)
}

/**
 * Perform a mutation whose reply is JSON, shaping both outcomes into an
 * `NpmWriteResult` rather than throwing.
 *
 * `status` on success is reported as 200 because the adapter contract hands
 * back a decoded body, not a response object. Callers branch on `success`; the
 * exact 2xx code an endpoint chose is not information they can act on.
 *
 * A 401 challenge is offered to `options.onAuth` and retried once. Without a
 * callback the challenge is just another failure, exactly as before.
 */
export async function sendJsonRequest<T>(
  url: string,
  init: NpmHttpInit,
  options: NpmRegistryHttpOptions & NpmAuthRetryOptions,
): Promise<NpmWriteResult<T>> {
  const opts = { __proto__: null, ...options } as typeof options
  try {
    const data = await sendWithNpmAuthRetry(
      async headers => await opts.http.json<T>(url, { ...init, headers }),
      init.headers,
      opts,
    )
    return shapeWriteSuccess(data)
  } catch (e) {
    return shapeWriteFailure(e)
  }
}

/**
 * Perform a mutation whose success is an empty `204 No Content`.
 *
 * Uses the adapter's `text` method on purpose. Handing an empty body to a JSON
 * decoder throws, and that throw is indistinguishable from a real failure, so
 * a `json`-based delete would report every success as an error.
 *
 * A 401 challenge is offered to `options.onAuth` and retried once, on the same
 * terms as {@link sendJsonRequest}.
 */
export async function sendNoContentRequest(
  url: string,
  init: NpmHttpInit,
  options: NpmRegistryHttpOptions & NpmAuthRetryOptions,
): Promise<NpmWriteResult<undefined>> {
  const opts = { __proto__: null, ...options } as typeof options
  try {
    await sendWithNpmAuthRetry(
      async headers => await opts.http.text(url, { ...init, headers }),
      init.headers,
      opts,
    )
    return { data: undefined, status: 204, success: true }
  } catch (e) {
    return shapeWriteFailure(e)
  }
}

/**
 * Shape a thrown adapter error into an `NpmWriteFailure`, attaching the
 * actionable hint for the status when one exists.
 */
export function shapeWriteFailure(e: unknown): NpmWriteFailure {
  const status = httpErrorStatus(e) ?? 0
  const hint = describeNpmStatus(status)
  const cause = npmErrorCause(e)
  return {
    cause,
    error:
      hint ??
      (status === 0
        ? 'The npm registry could not be reached.'
        : `The npm registry returned ${status}.`),
    status,
    success: false,
  }
}

/**
 * Shape a decoded reply into an `NpmWriteSuccess`.
 */
export function shapeWriteSuccess<T>(data: T): NpmWriteSuccess<T> {
  return { data, status: 200, success: true }
}
