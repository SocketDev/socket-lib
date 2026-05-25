/**
 * @file Node-side HTTP request layer — the public surface (`httpJson`,
 *   `httpText`, `httpRequest`, `HttpResponseError`) for consumers on Node.
 *   Pairs with `./browser` (browser-safe variant via `fetch`); both files
 *   expose the same named exports so the package.json `'browser'` condition can
 *   swap them by platform without consumers changing their imports. `httpJson`
 *   and `httpText` live here directly; `httpRequest` and the shared types are
 *   re-exported from their dedicated leaves so the sub-imports
 *   (`./http-request/request`, `./http-request/response-types`) stay loadable
 *   individually for callers that don't want the convenience wrappers in their
 *   bundle.
 */

import { ErrorCtor } from '../primordials/error'
import { httpRequest } from './request'
import { HttpResponseError } from './response-types'

import type { HttpRequestOptions } from './request-types'

export { httpRequest } from './request'
export { HttpResponseError } from './response-types'
export type { HttpResponse } from './response-types'
export type { HttpRequestOptions } from './request-types'

/**
 * GET / POST a JSON endpoint. Automatically sets `Accept: application/json` and
 * `Content-Type: application/json` (when a body is present); user-supplied
 * headers always win. Throws `HttpResponseError` on non-2xx.
 */
export async function httpJson<T = unknown>(
  url: string,
  options?: HttpRequestOptions | undefined,
): Promise<T> {
  const {
    body,
    headers = {},
    ...restOptions
  } = {
    __proto__: null,
    ...options,
  } as HttpRequestOptions
  const defaultHeaders: Record<string, string> = {
    Accept: 'application/json',
  }
  if (body) {
    defaultHeaders['Content-Type'] = 'application/json'
  }
  const mergedHeaders = {
    ...defaultHeaders,
    ...headers,
  }
  const response = await httpRequest(url, {
    body,
    headers: mergedHeaders,
    ...restOptions,
  })
  if (!response.ok) {
    throw new HttpResponseError(response)
  }
  try {
    return response.json<T>()
  } catch (e) {
    throw new ErrorCtor('Failed to parse JSON response', { cause: e })
  }
}

/**
 * GET / POST a text endpoint. Sets `Accept: text/plain` (and `Content-Type:
 * text/plain` on bodies); user headers override. Throws `HttpResponseError` on
 * non-2xx.
 */
export async function httpText(
  url: string,
  options?: HttpRequestOptions | undefined,
): Promise<string> {
  const {
    body,
    headers = {},
    ...restOptions
  } = {
    __proto__: null,
    ...options,
  } as HttpRequestOptions
  const defaultHeaders: Record<string, string> = {
    Accept: 'text/plain',
  }
  if (body) {
    defaultHeaders['Content-Type'] = 'text/plain'
  }
  const mergedHeaders = {
    ...defaultHeaders,
    ...headers,
  }
  const response = await httpRequest(url, {
    body,
    headers: mergedHeaders,
    ...restOptions,
  })
  if (!response.ok) {
    throw new HttpResponseError(response)
  }
  return response.text()
}
