/**
 * @fileoverview Async compression / decompression helpers (brotli + gzip).
 *
 * Three calling shapes cover most use cases:
 *
 *   1. In-memory — compress/decompress a Buffer or string, get a Buffer
 *      back. For payloads small enough to fit in memory.
 *
 *      const compressed = await compressBrotli(JSON.stringify(payload))
 *      const original = await decompressBrotli(compressed)
 *
 *   2. File-to-file — stream pipeline through zlib, no memory hit.
 *      For arbitrary-sized files (build artifacts, scan output, logs).
 *
 *      await compressBrotliFile('input.json', 'input.json.br')
 *      await decompressBrotliFile('input.json.br', 'input.json')
 *
 *   3. Raw streams — use directly in your own pipeline. The factory
 *      returns the underlying zlib transform so you can compose it
 *      with anything (e.g. tar pipelines, HTTP body streams).
 *
 *      readable.pipe(createBrotliCompressor()).pipe(writable)
 *
 * Detection:
 *
 *   - `isBrotliCompressed(buf)` — peek the first byte for the brotli
 *     magic-byte signature (no full parse).
 *   - `hasBrotliExtension(path)` — `.br` / `.brotli` filename suffix.
 *
 * Compression-level defaults are tuned for one-shot CLI use: brotli at
 * quality 11 (max compression, slow but it's a one-shot upload), gzip
 * at level 6 (the zlib default). Override via the `level` option if
 * the call is hot or the input is large.
 */

import { Buffer } from 'node:buffer'
import { createReadStream, createWriteStream } from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import {
  brotliCompress,
  brotliDecompress,
  constants as zlibConstants,
  createBrotliCompress,
  createBrotliDecompress,
  createGunzip,
  createGzip,
  gunzip,
  gzip,
  type BrotliOptions,
  type ZlibOptions,
} from 'node:zlib'
import { promisify } from 'node:util'

import { safeDelete } from './fs/safe'
import { StringPrototypeToLowerCase } from './primordials/string'
const brotliCompressAsync = promisify(brotliCompress)
const brotliDecompressAsync = promisify(brotliDecompress)
const gzipAsync = promisify(gzip)
const gunzipAsync = promisify(gunzip)

// ── Options ─────────────────────────────────────────────────────────

export interface CompressOptions {
  /**
   * Compression level. Brotli accepts 0–11 (11 = max, slowest). Gzip
   * accepts 0–9 (9 = max). Defaults: brotli 11, gzip 6.
   */
  level?: number | undefined
  /**
   * Hint for the input size in bytes. Lets brotli pick a better
   * window/blocking strategy. Pass when known; ignored for gzip.
   */
  size?: number | undefined
}

/**
 * Options for the file-to-file helpers. Pass `{ inPlace: true }` to
 * skip the explicit destPath argument: the helper picks the
 * canonical destination (`.br` / `.gz` suffix on compress; suffix
 * stripped on decompress) and removes the source file on success.
 *
 *   await compressBrotliFile('input.json', { inPlace: true })
 *   // => writes input.json.br, deletes input.json
 *
 *   await decompressBrotliFile('input.json.br', { inPlace: true })
 *   // => writes input.json, deletes input.json.br
 */
export interface CompressFileOptions extends CompressOptions {
  /**
   * Replace the source file: derive destPath from srcPath, then
   * `safeDelete(srcPath)` after the write succeeds. When set, the
   * `destPath` positional argument must be omitted.
   */
  inPlace?: boolean | undefined
}

interface ResolvedBrotliOptions extends BrotliOptions {
  params: NonNullable<BrotliOptions['params']>
}

/**
 * Translate `CompressOptions` into the `BrotliOptions` zlib expects.
 * Defaults `quality` to 11 (max) when not provided, and forwards a
 * positive `size` hint. Exposed for callers building their own zlib
 * pipelines and for unit-test coverage.
 */
export function resolveBrotliOptions(
  options: CompressOptions | undefined,
): ResolvedBrotliOptions {
  const level = options?.level ?? 11
  const params: NonNullable<BrotliOptions['params']> = {
    [zlibConstants.BROTLI_PARAM_QUALITY]: level,
  }
  if (options?.size !== undefined && options.size > 0) {
    params[zlibConstants.BROTLI_PARAM_SIZE_HINT] = options.size
  }
  return { params }
}

/**
 * Translate `CompressOptions` into the `ZlibOptions` zlib expects.
 * Returns an empty options object when no `level` is given (zlib uses
 * its default, level 6). Exposed for parity with
 * `resolveBrotliOptions` and for unit-test coverage.
 */
export function resolveGzipOptions(
  options: CompressOptions | undefined,
): ZlibOptions {
  const level = options?.level
  if (level === undefined) {
    return { __proto__: null } as unknown as ZlibOptions
  }
  return { __proto__: null, level } as unknown as ZlibOptions
}

// ── Brotli ──────────────────────────────────────────────────────────

/**
 * Compress a string or Buffer with brotli. Strings are encoded as UTF-8
 * before compression — pass an explicit Buffer if you have non-UTF-8
 * input.
 */
export async function compressBrotli(
  input: string | Buffer,
  options?: CompressOptions | undefined,
): Promise<Buffer> {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input
  const opts = resolveBrotliOptions(options)
  // Auto-fill size hint when not provided — brotli picks better
  // blocking when it knows the input size up front.
  if (opts.params[zlibConstants.BROTLI_PARAM_SIZE_HINT] === undefined) {
    opts.params[zlibConstants.BROTLI_PARAM_SIZE_HINT] = buf.byteLength
  }
  return await brotliCompressAsync(buf, opts)
}

/**
 * Decompress a brotli-compressed Buffer.
 */
export async function decompressBrotli(input: Buffer): Promise<Buffer> {
  return await brotliDecompressAsync(input)
}

/**
 * Stream-compress a file with brotli. Two call shapes:
 *
 *   compressBrotliFile(src, dest, options?)
 *     Writes compressed output to `dest`. Source is left intact.
 *
 *   compressBrotliFile(src, { inPlace: true, ...options })
 *     Writes to `<src>.br` and deletes `src` after the write
 *     succeeds. Returns the new path.
 *
 * Returns the destination path in both shapes — same string the
 * caller passed in or the computed `.br` path for inPlace.
 */
export async function compressBrotliFile(
  srcPath: string,
  destPath: string,
  options?: CompressOptions | undefined,
): Promise<string>
export async function compressBrotliFile(
  srcPath: string,
  options: CompressFileOptions,
): Promise<string>
export async function compressBrotliFile(
  srcPath: string,
  destOrOptions?: string | CompressFileOptions,
  maybeOptions?: CompressOptions | undefined,
): Promise<string> {
  const { destPath, options, inPlace } = resolveFileArgs(
    'compressBrotliFile',
    srcPath,
    destOrOptions,
    maybeOptions,
    p => `${p}.br`,
  )
  await pipeline(
    createReadStream(srcPath),
    createBrotliCompress(resolveBrotliOptions(options)),
    createWriteStream(destPath),
  )
  if (inPlace) {
    await safeDelete(srcPath)
  }
  return destPath
}

/**
 * Stream-decompress a brotli file. Two call shapes:
 *
 *   decompressBrotliFile(src, dest)
 *     Writes decompressed output to `dest`. Source is left intact.
 *
 *   decompressBrotliFile(src, { inPlace: true })
 *     Strips the `.br`/`.brotli` suffix to derive the destination,
 *     then deletes the compressed source after the write succeeds.
 *     Throws if `src` has no recognizable extension.
 *
 * Returns the destination path in both shapes.
 */
export async function decompressBrotliFile(
  srcPath: string,
  destPath: string,
): Promise<string>
export async function decompressBrotliFile(
  srcPath: string,
  options: CompressFileOptions,
): Promise<string>
export async function decompressBrotliFile(
  srcPath: string,
  destOrOptions?: string | CompressFileOptions,
): Promise<string> {
  const { destPath, inPlace } = resolveFileArgs(
    'decompressBrotliFile',
    srcPath,
    destOrOptions,
    undefined,
    p => {
      if (!hasBrotliExt(p)) {
        throw new Error(
          `decompressBrotliFile: ${p} has no .br/.brotli extension; can't infer destination`,
        )
      }
      return stripExt(p, BROTLI_EXTS)
    },
  )
  await pipeline(
    createReadStream(srcPath),
    createBrotliDecompress(),
    createWriteStream(destPath),
  )
  if (inPlace) {
    await safeDelete(srcPath)
  }
  return destPath
}

/**
 * Create a brotli compress transform stream. Compose into your own
 * pipeline. The `pipeline` from `node:stream/promises` is the safe
 * way to wire it up — it handles error propagation across all stages.
 */
export function createBrotliCompressor(options?: CompressOptions | undefined) {
  return createBrotliCompress(resolveBrotliOptions(options))
}

/**
 * Create a brotli decompress transform stream.
 */
export function createBrotliDecompressor() {
  return createBrotliDecompress()
}

// ── Gzip ────────────────────────────────────────────────────────────

/**
 * Compress a string or Buffer with gzip. Strings are encoded as UTF-8
 * before compression. Default level is 6 (zlib default).
 */
export async function compressGzip(
  input: string | Buffer,
  options?: CompressOptions | undefined,
): Promise<Buffer> {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input
  return await gzipAsync(buf, resolveGzipOptions(options))
}

/**
 * Decompress a gzip-compressed Buffer.
 */
export async function decompressGzip(input: Buffer): Promise<Buffer> {
  return await gunzipAsync(input)
}

/**
 * Stream-compress a file with gzip. Two call shapes:
 *
 *   compressGzipFile(src, dest, options?)
 *     Writes compressed output to `dest`. Source is left intact.
 *
 *   compressGzipFile(src, { inPlace: true, ...options })
 *     Writes to `<src>.gz` and deletes `src` after the write
 *     succeeds. Returns the new path.
 */
export async function compressGzipFile(
  srcPath: string,
  destPath: string,
  options?: CompressOptions | undefined,
): Promise<string>
export async function compressGzipFile(
  srcPath: string,
  options: CompressFileOptions,
): Promise<string>
export async function compressGzipFile(
  srcPath: string,
  destOrOptions?: string | CompressFileOptions,
  maybeOptions?: CompressOptions | undefined,
): Promise<string> {
  const { destPath, options, inPlace } = resolveFileArgs(
    'compressGzipFile',
    srcPath,
    destOrOptions,
    maybeOptions,
    p => `${p}.gz`,
  )
  await pipeline(
    createReadStream(srcPath),
    createGzip(resolveGzipOptions(options)),
    createWriteStream(destPath),
  )
  if (inPlace) {
    await safeDelete(srcPath)
  }
  return destPath
}

/**
 * Stream-decompress a gzip file. Two call shapes:
 *
 *   decompressGzipFile(src, dest)
 *     Writes decompressed output to `dest`. Source is left intact.
 *
 *   decompressGzipFile(src, { inPlace: true })
 *     Strips the `.gz`/`.gzip`/`.tgz` suffix to derive the
 *     destination, then deletes the compressed source after the
 *     write succeeds. Throws if `src` has no recognizable extension.
 */
export async function decompressGzipFile(
  srcPath: string,
  destPath: string,
): Promise<string>
export async function decompressGzipFile(
  srcPath: string,
  options: CompressFileOptions,
): Promise<string>
export async function decompressGzipFile(
  srcPath: string,
  destOrOptions?: string | CompressFileOptions,
): Promise<string> {
  const { destPath, inPlace } = resolveFileArgs(
    'decompressGzipFile',
    srcPath,
    destOrOptions,
    undefined,
    p => {
      if (!hasGzipExt(p)) {
        throw new Error(
          `decompressGzipFile: ${p} has no .gz/.gzip/.tgz extension; can't infer destination`,
        )
      }
      // .tgz is conventionally .tar.gz collapsed — recover the .tar so
      // a round-trip through compress/decompress is lossless.
      const stripped = stripExt(p, GZIP_EXTS)
      return StringPrototypeToLowerCase(path.extname(p)) === '.tgz'
        ? `${stripped}.tar`
        : stripped
    },
  )
  await pipeline(
    createReadStream(srcPath),
    createGunzip(),
    createWriteStream(destPath),
  )
  if (inPlace) {
    await safeDelete(srcPath)
  }
  return destPath
}

/**
 * Create a gzip compress transform stream.
 */
export function createGzipCompressor(options?: CompressOptions | undefined) {
  return createGzip(resolveGzipOptions(options))
}

/**
 * Create a gzip decompress transform stream.
 */
export function createGzipDecompressor() {
  return createGunzip()
}

// ── Detection ───────────────────────────────────────────────────────

// Brotli has no defined magic bytes — the format starts with header
// data that can technically be anything. The closest signal is the
// last-byte stream-end pattern. We reject obviously-not-brotli input
// (empty / under 4 bytes) and let the caller catch decode errors as
// the authoritative "is it brotli?" check.
//
// Use this only for cheap pre-flight rejection; never as a security
// or correctness gate.
const BROTLI_MIN_LEN = 4

/**
 * Cheap pre-flight check: does the buffer look like it could be
 * brotli? Returns false for inputs too short to be valid. Brotli has
 * no fixed magic bytes, so this is intentionally permissive — the
 * authoritative test is `decompressBrotli(buf)` succeeding. Use for
 * UI hints, not correctness.
 */
export function isBrotliCompressed(input: Buffer): boolean {
  return Buffer.isBuffer(input) && input.byteLength >= BROTLI_MIN_LEN
}

// Gzip has a real magic-byte signature: 0x1f 0x8b.
const GZIP_MAGIC_0 = 0x1f
const GZIP_MAGIC_1 = 0x8b

/**
 * Magic-byte check for gzip. Reads the first two bytes and matches
 * the gzip spec's 0x1f 0x8b signature. Authoritative.
 */
export function isGzipCompressed(input: Buffer): boolean {
  return (
    Buffer.isBuffer(input) &&
    input.byteLength >= 2 &&
    input[0] === GZIP_MAGIC_0 &&
    input[1] === GZIP_MAGIC_1
  )
}

// Use Sets — O(1) lookup, sorted alphanumerically per CLAUDE.md so
// adding a new extension stays a one-line append. node:path's extname
// is case-sensitive (it reflects the OS path semantics), but our
// extension classifier is policy: ".BR" should classify the same as
// ".br" regardless of host OS. Lowercase the extname before lookup.
//
// Exported so callers can introspect what counts as a "brotli" or
// "gzip" extension without re-implementing the list, and so tests can
// pin the recognized sets.
export const BROTLI_EXTS: ReadonlySet<string> = new Set(['.br', '.brotli'])
export const GZIP_EXTS: ReadonlySet<string> = new Set(['.gz', '.gzip', '.tgz'])

/**
 * Extension check for brotli paths — matches `.br` / `.brotli`
 * (case-insensitive). Naming follows node:path's `extname`.
 */
export function hasBrotliExt(filePath: string): boolean {
  return BROTLI_EXTS.has(StringPrototypeToLowerCase(path.extname(filePath)))
}

/**
 * Extension check for gzip paths — matches `.gz` / `.gzip` / `.tgz`
 * (case-insensitive). Naming follows node:path's `extname`.
 */
export function hasGzipExt(filePath: string): boolean {
  return GZIP_EXTS.has(StringPrototypeToLowerCase(path.extname(filePath)))
}

/**
 * Strip the trailing extension from a filename when it matches one of
 * `exts`. Returns the input unchanged when the trailing extname isn't
 * in the set. Case-insensitive on the extension — preserves the rest
 * of the path's casing.
 *
 * The `exts` set decides what counts. Pass `BROTLI_EXTS` / `GZIP_EXTS`
 * (re-exported from this module) for the canonical compression sets,
 * or your own set for custom classifiers.
 *
 * This helper is generic — it does NOT know that `.tgz` is short for
 * `.tar.gz`. Callers that need that convention compose this with their
 * own follow-up (see `decompressGzipFile` for the canonical example).
 */
export function stripExt(filePath: string, exts: ReadonlySet<string>): string {
  const ext = path.extname(filePath)
  if (!exts.has(StringPrototypeToLowerCase(ext))) {
    return filePath
  }
  return filePath.slice(0, -ext.length)
}

// ── Internal: file-arg resolver ─────────────────────────────────────

interface ResolvedFileArgs {
  destPath: string
  options: CompressOptions | undefined
  inPlace: boolean
}

/**
 * Disambiguate the `(src, dest, options?)` and `(src, options)`
 * call shapes. Returns the resolved destPath, options, and inPlace
 * flag. Validates that the explicit destPath is not the same as
 * srcPath, since same-path streams would deadlock on read.
 */
export function resolveFileArgs(
  fnName: string,
  srcPath: string,
  destOrOptions: string | CompressFileOptions | undefined,
  maybeOptions: CompressOptions | undefined,
  computeInPlaceDest: (src: string) => string,
): ResolvedFileArgs {
  if (typeof destOrOptions === 'string') {
    if (srcPath === destOrOptions) {
      throw new Error(
        `${fnName}: srcPath and destPath must differ; got ${srcPath}`,
      )
    }
    return Object.freeze({
      __proto__: null,
      destPath: destOrOptions,
      options: maybeOptions,
      inPlace: false,
    } as unknown as ResolvedFileArgs)
  }
  // Options object (or undefined → not inPlace, no destPath given).
  if (destOrOptions?.inPlace) {
    return Object.freeze({
      __proto__: null,
      destPath: computeInPlaceDest(srcPath),
      options: destOrOptions,
      inPlace: true,
    } as unknown as ResolvedFileArgs)
  }
  // No destPath, no inPlace — caller forgot the destination.
  throw new Error(
    `${fnName}: missing destPath; pass an explicit destination or { inPlace: true }`,
  )
}
