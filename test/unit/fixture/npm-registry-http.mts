/**
 * @file Injected HTTP adapters for the npm registry API tests. Every adapter
 *   here is synchronous and in-memory, so the whole suite runs with no
 *   network: the modules under test never construct a client of their own,
 *   they only ever call what is handed to them.
 *   All three adapters implement `bytes` as well as `json` and `text`, because
 *   `NpmHttpAdapter` requires it. A double that only spoke JSON would let a
 *   binary endpoint go untested behind a type error.
 */

/**
 * The request parts an adapter is handed. Mirrors `NpmHttpInit` from
 * `src/eco/npm/registry/index.mts`, spelled out here so the test doubles do not
 * import the type they exist to satisfy.
 */
export interface RecordedInit {
  body?: string | undefined
  headers?: Record<string, string> | undefined
  method?: string | undefined
}

/**
 * One request an adapter was asked to perform.
 */
export interface RecordedCall {
  body?: string | undefined
  headers?: Record<string, string> | undefined
  method?: string | undefined
  url: string
}

/**
 * An adapter that answers `payload` for any URL and records every request.
 *
 * `text` answers the empty string, which is what a real adapter returns for
 * the `204 No Content` replies the delete routes produce. `bytes` answers
 * `payload` when it already is a `Uint8Array` and an empty one otherwise, so a
 * test that only cares about the URL and headers of a binary call does not
 * have to supply bytes it will not read.
 */
export function recordingHttp(payload?: unknown | undefined) {
  const calls: RecordedCall[] = []
  const record = (url: string, init?: RecordedInit | undefined) => {
    calls.push({
      body: init?.body,
      headers: init?.headers,
      method: init?.method,
      url,
    })
  }
  return {
    calls,
    http: {
      async bytes(
        url: string,
        init?: RecordedInit | undefined,
      ): Promise<Uint8Array> {
        record(url, init)
        return payload instanceof Uint8Array ? payload : new Uint8Array(0)
      },
      async json<T>(url: string, init?: RecordedInit | undefined): Promise<T> {
        record(url, init)
        return payload as T
      },
      async text(
        url: string,
        init?: RecordedInit | undefined,
      ): Promise<string> {
        record(url, init)
        return ''
      },
    },
  }
}

/**
 * An adapter that always rejects, with an optional HTTP status.
 *
 * Omitting `status` models a transport-level failure: DNS, a dropped
 * connection, a timeout. Nothing about it carries a status, which is exactly
 * what separates "could not ask" from "was told no".
 */
export function failingHttp(status?: number | undefined) {
  const error = () =>
    Object.assign(new Error('boom'), status === undefined ? {} : { status })
  return {
    http: {
      async bytes(): Promise<Uint8Array> {
        throw error()
      },
      async json<T>(): Promise<T> {
        throw error()
      },
      async text(): Promise<string> {
        throw error()
      },
    },
  }
}

/**
 * An adapter that counts how many times it was actually asked, so a test can
 * prove a cache served a second call instead of re-fetching.
 */
export function countingHttp(payload: unknown) {
  const state = { count: 0 }
  return {
    http: {
      async bytes(): Promise<Uint8Array> {
        state.count += 1
        return payload instanceof Uint8Array ? payload : new Uint8Array(0)
      },
      async json<T>(): Promise<T> {
        state.count += 1
        return payload as T
      },
      async text(): Promise<string> {
        state.count += 1
        return ''
      },
    },
    state,
  }
}

/**
 * Wait `ms` milliseconds of real time. Used only to step past a deliberately
 * tiny cache TTL; the TTL store reads the wall clock, so a real wait is the
 * honest way to observe an expiry.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
