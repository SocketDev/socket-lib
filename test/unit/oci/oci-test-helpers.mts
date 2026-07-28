/**
 * @file Shared fake OCI HTTP adapter for the oci/ client tests. Drives the
 *   injectable `{ http: { json, request } }` surface from in-memory route maps
 *   so the anon-pull flow is exercised end-to-end with no live network.
 */

import type {
  OciHttpAdapter,
  OciHttpResponse,
  OciRequestOptions,
} from '../../../src/oci/types'

/**
 * A canned response for one URL: the status, headers, and either a JSON body,
 * a text body, or raw bytes.
 */
export interface FakeRoute {
  body?: unknown | undefined
  bytes?: Uint8Array | undefined
  headers?: Record<string, string | string[] | undefined> | undefined
  status?: number | undefined
  statusText?: string | undefined
  text?: string | undefined
}

/**
 * Records every request the client makes, so a test can assert on the URLs and
 * headers sent, such as the bearer token and the Accept media types.
 */
export interface FakeCall {
  headers: Record<string, string> | undefined
  url: string
}

export interface FakeAdapter {
  calls: FakeCall[]
  http: OciHttpAdapter
}

function encodeText(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

function routeToResponse(route: FakeRoute): OciHttpResponse {
  const status = route.status ?? 200
  const bytes =
    route.bytes ??
    (route.text !== undefined
      ? encodeText(route.text)
      : route.body !== undefined
        ? encodeText(JSON.stringify(route.body))
        : new Uint8Array(0))
  return {
    arrayBuffer(): ArrayBuffer {
      const copy = new Uint8Array(bytes.byteLength)
      copy.set(bytes)
      return copy.buffer
    },
    headers: route.headers ?? {},
    json<T = unknown>(): T {
      if (route.body !== undefined) {
        return route.body as T
      }
      return JSON.parse(new TextDecoder().decode(bytes)) as T
    },
    ok: status >= 200 && status <= 299,
    status,
    statusText: route.statusText ?? '',
    text(): string {
      return new TextDecoder().decode(bytes)
    },
  }
}

/**
 * Build a fake adapter from a URL → route map. `json` throws on a non-2xx (the
 * `HttpResponseError` shape lib's real `httpJson` would throw); `request`
 * returns the canned response verbatim so callers can inspect status/headers.
 */
export function makeFakeAdapter(routes: Map<string, FakeRoute>): FakeAdapter {
  const calls: FakeCall[] = []
  const http: OciHttpAdapter = {
    async json<T = unknown>(
      url: string,
      options?: OciRequestOptions | undefined,
    ): Promise<T> {
      calls.push({ headers: options?.headers, url })
      const route = routes.get(url)
      if (!route) {
        throw new Error(`Unexpected URL in test: ${url}`)
      }
      const res = routeToResponse(route)
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`)
      }
      return res.json<T>()
    },
    async request(
      url: string,
      options?: OciRequestOptions | undefined,
    ): Promise<OciHttpResponse> {
      calls.push({ headers: options?.headers, url })
      const route = routes.get(url)
      if (!route) {
        throw new Error(`Unexpected URL in test: ${url}`)
      }
      return routeToResponse(route)
    },
  }
  return { calls, http }
}

/**
 * The sha256 hex digest of `bytes`, as `sha256:<hex>` — mirrors the caller-side
 * verification the blob fetch delegates.
 */
export async function sha256Digest(bytes: Uint8Array): Promise<string> {
  const view = new Uint8Array(bytes.byteLength)
  view.set(bytes)
  const hash = await crypto.subtle.digest('SHA-256', view.buffer)
  const hex = Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return `sha256:${hex}`
}
