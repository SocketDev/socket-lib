/**
 * @file Browser-safe npm tarball reading. Mirrors the IN-MEMORY half of
 *   `./node` - `readNpmTarballEntries` and `readNpmTarballManifest` behave
 *   identically on both, because both delegate the header walk to `./shared`.
 *   The Node twin additionally writes to disk, which a browser cannot, so it is
 *   a superset rather than a mirror; see that file's header for why the two
 *   are NOT swapped by a `browser` condition on one export path.
 *   Gunzip uses `DecompressionStream('gzip')`, a web standard available in
 *   every current browser, in MV3 service workers, and in Node 18+. No gzip
 *   dependency is added, and nothing here imports a Node builtin - which
 *   `scripts/repo/check/browser-exports-have-no-node-builtins.mts` enforces on
 *   every build rather than trusting this comment.
 *   `DecompressionStream` is a runtime capability, not a syntax one, so a
 *   context without it gets a named error instead of a `TypeError` about an
 *   undefined constructor.
 */

/// <reference lib="dom" />

import { JSONParse } from '../../../primordials/json.mjs'

import {
  isGzipBytes,
  newNotGzipError,
  NPM_TARBALL_STRIP,
  readTarEntries,
} from './shared.mjs'

import type { ExtractOptions } from '../../../archives/types.mjs'
import type { NpmTarballEntry } from './shared.mjs'

export type { NpmTarballEntry } from './shared.mjs'

/**
 * Gunzip bytes with the platform's `DecompressionStream`.
 *
 * Streaming through `Response.arrayBuffer()` keeps the whole thing to one
 * await and lets the platform own the chunking.
 *
 * @throws {Error} When the runtime has no `DecompressionStream`, or when the
 *   bytes are not a valid gzip stream.
 */
export async function gunzipBytes(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream !== 'function') {
    throw new Error(
      'gunzipBytes: this runtime has no DecompressionStream, so gzipped npm tarballs cannot be read here. It is standard in current browsers, in MV3 service workers, and in Node 18+.',
    )
  }
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/**
 * Read the regular files out of npm tarball bytes, in memory.
 *
 * `bytes` is a gzipped tar exactly as the registry sent it. One leading path
 * component is stripped by default, because every npm tarball roots its files
 * under `package/`; pass `strip: 0` to keep it.
 *
 * The security limits of `./shared` apply: entry count, single-file size,
 * total size, null bytes in names, and symlink or hardlink entries are all
 * rejected.
 *
 * @throws {Error} When `bytes` is not a gzip archive, or the reader trips one
 *   of its limits.
 */
export async function readNpmTarballEntries(
  bytes: Uint8Array,
  options?: ExtractOptions | undefined,
): Promise<NpmTarballEntry[]> {
  if (!isGzipBytes(bytes)) {
    throw newNotGzipError(bytes.byteLength)
  }
  const opts = {
    __proto__: null,
    strip: NPM_TARBALL_STRIP,
    ...options,
  } as ExtractOptions
  return readTarEntries(await gunzipBytes(bytes), opts)
}

/**
 * Read the `package.json` out of npm tarball bytes.
 *
 * The cheapest useful inspection of a staged artifact: confirm the name and
 * version inside the archive match the ones the staging record claims.
 *
 * Returns `undefined` when the archive holds no `package.json`, and when the
 * one it holds is not valid JSON or does not decode to an object. That is an
 * answer about bytes the caller already has, not about a registry that could
 * not be reached, so there is nothing ambiguous to report.
 *
 * @throws {Error} When `bytes` is not a gzip archive, or the reader trips one
 *   of its limits.
 */
export async function readNpmTarballManifest(
  bytes: Uint8Array,
  options?: ExtractOptions | undefined,
): Promise<Record<string, unknown> | undefined> {
  const entries = await readNpmTarballEntries(bytes, options)
  const manifest = entries.find(entry => entry.name === 'package.json')
  if (!manifest) {
    return undefined
  }
  let parsed: unknown
  try {
    parsed = JSONParse(new TextDecoder('utf-8').decode(manifest.bytes))
  } catch {
    return undefined
  }
  return parsed === null || typeof parsed !== 'object'
    ? undefined
    : (parsed as Record<string, unknown>)
}
