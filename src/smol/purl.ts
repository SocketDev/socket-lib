/**
 * @fileoverview Lazy-loader for socket-btm's `node:smol-purl` binding.
 *
 * `node:smol-purl` is a C++-accelerated PURL (Package URL) parser
 * exposed by socket-btm's smol Node binary. It parses, builds, and
 * validates PURL strings using primordial-cached string ops, with a
 * 10 000-entry result cache.
 *
 * Returns `undefined` on stock Node + non-Node runtimes. Result is
 * cached across calls. Callers fall back to the JS
 * `@socketregistry/packageurl-js` import on the undefined path.
 *
 * @internal — used by `src/packages/operations.ts` to resolve the
 *   `pkg:npm/<name>` parse on `resolveRegistryPackageName`. Most
 *   callers should keep using `PackageURL` from
 *   `external/@socketregistry/packageurl-js` directly; this loader
 *   only matters where the hot path warrants the native acceleration.
 */

import { isModuleBuiltin } from './is-module-builtin'

/**
 * Surface of a parsed PURL — the shape both smol-purl's `parse()` and
 * `packageurl-js`'s `PackageURL.fromString()` agree on. Frozen plain
 * object on smol; `PackageURL` class instance on stock Node. Both
 * expose the same readable fields, so consumers can destructure
 * uniformly.
 */
export interface ParsedPurl {
  readonly type: string
  readonly namespace: string | undefined
  readonly name: string
  readonly version: string | undefined
  readonly qualifiers: Readonly<Record<string, string>> | undefined
  readonly subpath: string | undefined
}

/**
 * Options passed to a PURL builder. Mirrors the constructor args of
 * `PackageURL.fromObject` and the input object accepted by smol-purl's
 * `build()`.
 */
export interface PurlBuildOptions {
  type: string
  namespace?: string | undefined
  name: string
  version?: string | undefined
  qualifiers?: Readonly<Record<string, string>> | undefined
  subpath?: string | undefined
}

/**
 * Surface of `node:smol-purl`. See socket-btm's
 * additions/source-patched/lib/smol-purl.js for the canonical shape.
 *
 * Only the ops socket-lib actually uses are typed here; smol-purl also
 * exposes `parseBatch`, `cacheStats`, `clearCache`, `types`, etc., but
 * those aren't part of the lib's consumer surface today.
 */
export interface SmolPurlBinding {
  /**
   * Parse a PURL string. Throws `PurlError` on invalid input.
   */
  parse(purl: string): ParsedPurl
  /**
   * Try to parse a PURL string. Returns `undefined` on any failure
   * (matches the Safe-suffix non-throwing convention).
   */
  tryParse(purl: string): ParsedPurl | undefined
  /**
   * Build a PURL string from components. Throws on invalid input
   * (missing type / name).
   */
  build(options: PurlBuildOptions): string
  /**
   * Returns `true` if the input is a valid PURL string.
   */
  isValid(purl: string): boolean
  /**
   * Normalize a PURL — lowercases the type, sorts qualifier keys, and
   * round-trips through parse + build.
   */
  normalize(purl: string): string
  /**
   * Compare two PURLs for normalized equality.
   */
  equals(a: string, b: string): boolean
}

let _smolPurl: SmolPurlBinding | undefined
let _smolPurlProbed = false

/**
 * Returns `node:smol-purl` when running on the smol Node binary,
 * otherwise `undefined`. Result is cached across calls.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getSmolPurl(): SmolPurlBinding | undefined {
  if (!_smolPurlProbed) {
    _smolPurlProbed = true
    if (isModuleBuiltin('node:smol-purl')) {
      _smolPurl = require('node:smol-purl') as SmolPurlBinding
    }
  }
  return _smolPurl
}
