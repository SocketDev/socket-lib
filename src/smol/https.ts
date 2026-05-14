/**
 * @fileoverview Lazy-loader for socket-btm's `node:smol-https`.
 *
 * `node:smol-https` is the HTTPS-flavored server entry shipped by
 * socket-btm's smol Node binary. It wraps `node:smol-http`'s `serve`
 * with performance-oriented TLS defaults (X25519+P-256 curves,
 * pre-vetted cipher list, 24-hour session timeout) and validates
 * that TLS options are present.
 *
 * Returns `undefined` on stock Node + non-Node runtimes. Result is
 * cached across calls.
 *
 * @internal — `src/http-request/` is the natural consumer. Most
 *   callers should use the standard server-side helpers, which
 *   route through this when smol is present.
 */

import { isNodeBuiltin } from '../node/module'

/**
 * TLS options accepted by `smol-https`'s `serve()`. Mirrors Node's
 * `tls.TlsOptions` for the fields socket-lib reads; callers needing
 * more can widen the type at the callsite.
 */
export interface SmolHttpsTlsOptions {
  readonly key?: Buffer | string | undefined
  readonly cert?: Buffer | string | undefined
  readonly ca?: Buffer | string | ReadonlyArray<Buffer | string> | undefined
  readonly passphrase?: string | undefined
  readonly sessionTimeout?: number | undefined
  readonly honorCipherOrder?: boolean | undefined
  readonly ecdhCurve?: string | undefined
  readonly ciphers?: string | undefined
}

/**
 * Options accepted by `smol-https`'s `serve()`. Mirrors
 * `smol-http`'s `serve` options + TLS extensions.
 */
export interface SmolHttpsServeOptions {
  readonly port?: number | undefined
  readonly hostname?: string | undefined
  readonly key?: Buffer | string | undefined
  readonly cert?: Buffer | string | undefined
  readonly ca?: Buffer | string | ReadonlyArray<Buffer | string> | undefined
  readonly passphrase?: string | undefined
  readonly tls?: SmolHttpsTlsOptions | undefined
  fetch(request: unknown): unknown | Promise<unknown>
}

/**
 * Surface of `node:smol-https`. See socket-btm's
 * additions/source-patched/lib/smol-https.js for the canonical
 * shape — a single `serve()` factory backed by `smol-http.serve()`
 * plus injected fast-TLS defaults.
 */
export interface SmolHttpsBinding {
  /**
   * Create an HTTPS server. Throws `TypeError` when no TLS options
   * are provided (use `node:smol-http`'s `serve()` for plain HTTP).
   */
  serve(options: SmolHttpsServeOptions): unknown
}

let _smolHttps: SmolHttpsBinding | undefined
let _smolHttpsProbed = false

/**
 * Returns `node:smol-https` when running on the smol Node binary,
 * otherwise `undefined`. Result is cached across calls.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getSmolHttps(): SmolHttpsBinding | undefined {
  if (!_smolHttpsProbed) {
    _smolHttpsProbed = true
    /* c8 ignore start - smol Node binary only. */
    if (isNodeBuiltin('node:smol-https')) {
      _smolHttps = require('node:smol-https') as SmolHttpsBinding
    }
    /* c8 ignore stop */
  }
  return _smolHttps
}
