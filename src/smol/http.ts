/**
 * @fileoverview Lazy-loader for socket-btm's `node:smol-http`.
 *
 * `node:smol-http` is the C++-accelerated HTTP server + client
 * binding shipped by socket-btm's smol Node binary. It backs a
 * pipelined HTTP/1.1 + HTTP/2 client (`request`), a uWS-backed
 * server (`serve`), and a family of fast-path response writers
 * (`fastJsonResponse`, `fastErrorResponse`, etc.) that bypass the
 * `http.ServerResponse` allocation hot path.
 *
 * Returns `undefined` on stock Node + non-Node runtimes. Result is
 * cached across calls.
 *
 * @internal — `src/http-request/` is the natural consumer. Most
 *   callers should use the standard `httpRequest` / `httpJson` /
 *   `httpText` exports, which already route through this when smol
 *   is present.
 */

import { isNodeBuiltin } from '../node/module'

/**
 * Options accepted by `smol-http`'s `request()`. The full surface is
 * larger; socket-lib types only the fields it actually reads. Callers
 * needing more can widen the type at the callsite.
 */
export interface SmolHttpRequestOptions {
  readonly method?: string | undefined
  readonly headers?: Readonly<Record<string, string>> | undefined
  readonly body?: string | Buffer | undefined
  readonly timeout?: number | undefined
}

/**
 * Surface of `node:smol-http`. See socket-btm's
 * additions/source-patched/lib/smol-http.js (and the
 * `internal/socketsecurity/http/core.js` barrel it re-exports) for
 * the canonical shape.
 *
 * Only the entries socket-lib's `http-request/` module needs are
 * typed here. The full surface (server-side `serve`, uWS-backed
 * `fast*Response` writers, `withCork`, `setPipelining`, etc.) is
 * available as `Record<string, unknown>` for callers that need it
 * without expanding the contract here.
 */
export interface SmolHttpBinding {
  /**
   * Lean pipelining-aware HTTP client. Signature mirrors `node:http`'s
   * `request` but returns a thinner-allocation response.
   */
  request(url: string, options?: SmolHttpRequestOptions): Promise<unknown>
  /**
   * Toggle pipelining on the shared client pool. On by default.
   */
  setPipelining(enabled: boolean): void
  /**
   * `true` if the binary was built with io_uring support (Linux only).
   */
  readonly isIoUringAvailable: boolean
  /**
   * `true` if the binary was built with mimalloc.
   */
  readonly isMimallocAvailable: boolean
}

let _smolHttp: SmolHttpBinding | undefined
let _smolHttpProbed = false

/**
 * Returns `node:smol-http` when running on the smol Node binary,
 * otherwise `undefined`. Result is cached across calls.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getSmolHttp(): SmolHttpBinding | undefined {
  if (!_smolHttpProbed) {
    _smolHttpProbed = true
    if (isNodeBuiltin('node:smol-http')) {
      _smolHttp = require('node:smol-http') as SmolHttpBinding
    }
  }
  return _smolHttp
}
