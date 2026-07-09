/**
 * @file Shared fakes + setup for the npm metadata client specs — a
 *   call-recording `NpmMetaHttpAdapter` test double, a deferred-promise
 *   helper for concurrency / in-flight-dedupe tests, the `freshCache` /
 *   `freshOptions` cache factories, and the per-test cacache-directory
 *   isolation `beforeEach`/`afterEach` shared by every spec file in this
 *   directory.
 */

import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach } from 'vitest'

import { resetEnv, setEnv } from '../../../src/env/rewire'
// no-platform-http-import: test-only double for the Node-only npm-meta client; node platform is intentional.
import { HttpResponseError } from '../../../src/http-request/node'
// no-platform-http-import: test-only double for the Node-only npm-meta client; node platform is intentional.
import type {
  HttpRequestOptions,
  HttpResponse,
} from '../../../src/http-request/node'
import { createNpmMetaCache } from '../../../src/npm/meta-cache'
import type { NpmMetaHttpAdapter } from '../../../src/npm/meta-types'
import { invalidateCaches } from '../../../src/paths/rewire'

import type { TtlCache, TtlCacheOptions } from '../../../src/cache/ttl/types'

export interface Deferred<T> {
  promise: Promise<T>
  reject: (reason: unknown) => void
  resolve: (value: T) => void
}

export interface RecordedHttpCall {
  options: HttpRequestOptions | undefined
  url: string
}

export interface StubHttpAdapter extends NpmMetaHttpAdapter {
  calls: RecordedHttpCall[]
}

/**
 * Create a resolvers-pattern deferred promise — lets a test control exactly
 * when an in-flight `json()` call resolves, so it can assert on state while
 * the call is still pending (in-flight dedupe, concurrency bounds).
 */
export function createDeferred<T>(): Deferred<T> {
  let reject!: (reason: unknown) => void
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, reject, resolve }
}

/**
 * Build an `NpmMetaHttpAdapter` test double that records every call
 * (`url` + the `options` bag, so a test can assert on the `Accept` header)
 * and resolves via `responder`.
 */
export function createStubHttpAdapter(
  responder: (url: string, options: HttpRequestOptions | undefined) => unknown,
): StubHttpAdapter {
  const calls: RecordedHttpCall[] = []
  return {
    calls,
    async json<T>(
      url: string,
      options?: HttpRequestOptions | undefined,
    ): Promise<T> {
      calls.push({ options, url })
      return (await responder(url, options)) as T
    },
  }
}

/**
 * Create an isolated `TtlCache` for one test — a unique `prefix` derived from
 * `seed` (plus the current time, so re-running the same test twice never
 * collides) keeps its cacache entries from bleeding into any other test.
 */
export function freshCache(
  seed: string,
  options?: TtlCacheOptions | undefined,
): TtlCache {
  return createNpmMetaCache({ prefix: `t-${Date.now()}-${seed}`, ...options })
}

/**
 * `freshCache` plus a `StubHttpAdapter` resolving via `responder` — the
 * `{ cache, http }` options bag most `getVersions` / `getLatestVersion` tests
 * spread into their call.
 */
export function freshOptions(
  seed: string,
  responder: (url: string, options: HttpRequestOptions | undefined) => unknown,
): { cache: TtlCache; http: StubHttpAdapter } {
  return { cache: freshCache(seed), http: createStubHttpAdapter(responder) }
}

/**
 * Build a real `HttpResponseError` with the given `status` — the shape
 * `getPackumentSlim`'s 404 handling checks via `instanceof`. Every
 * `HttpResponse` field is populated with an inert stand-in since only
 * `status`/`ok`/`statusText` matter for these tests.
 */
export function makeHttpResponseError(
  status: number,
  statusText = 'Error',
): HttpResponseError {
  const response: HttpResponse = {
    arrayBuffer: () => new ArrayBuffer(0),
    body: Buffer.alloc(0),
    headers: {},
    json: <T,>() => ({}) as T,
    ok: false,
    status,
    statusText,
    text: () => '',
  }
  return new HttpResponseError(response)
}

/**
 * Wire up the per-test cacache-directory isolation every spec file in this
 * directory needs: `beforeEach` points `SOCKET_CACACHE_DIR` at a fresh,
 * unique temp directory (after invalidating the memoized path so the new
 * value takes effect), `afterEach` restores the real environment. `dirTag`
 * distinguishes one spec file's temp directories from another's for easier
 * debugging (e.g. `'socket-test-npm-meta-cache'`).
 */
export function setupNpmMetaCacheIsolation(dirTag: string): void {
  beforeEach(() => {
    invalidateCaches()
    const testCacheDir = path.join(
      os.tmpdir(),
      `${dirTag}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    setEnv('SOCKET_CACACHE_DIR', testCacheDir)
  })

  afterEach(() => {
    resetEnv()
  })
}
