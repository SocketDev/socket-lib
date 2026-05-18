/**
 * @file `ManifestError` — the error class every parser in
 *   `src/eco/<pm>/parse-*` and every dispatcher in `src/eco/manifest/*` throws
 *   on invalid / unsupported input. Shape matches socket-btm's smol-manifest
 *   `ManifestError` so the smol-vs-JS swap is invisible to consumers
 *   (`instanceof ManifestError` works on both paths because each impl exposes
 *   its own constructor — consumers should match on `error.name ===
 *   'ManifestError'` for cross-impl identification). Codes:
 *
 *   - `ERR_INVALID_JSON` — JSON.parse failure
 *   - `ERR_UNKNOWN_FORMAT` — filename or content didn't match a parser
 *   - `ERR_UNSUPPORTED` — ecosystem not yet implemented
 */

export type ManifestErrorCode =
  | 'ERR_INVALID_JSON'
  | 'ERR_UNKNOWN_FORMAT'
  | 'ERR_UNSUPPORTED'

export class ManifestError extends Error {
  readonly code: ManifestErrorCode

  constructor(message: string, code: ManifestErrorCode) {
    super(message)
    this.name = 'ManifestError'
    this.code = code
  }
}
