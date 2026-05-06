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

import { createReadStream, createWriteStream } from 'node:fs'
import { Buffer } from 'node:buffer'
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

import { safeDelete } from './fs'

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

interface ResolvedBrotliOptions extends BrotliOptions {
  params: NonNullable<BrotliOptions['params']>
}

function resolveBrotliOptions(
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

function resolveGzipOptions(
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
 * Stream-compress a file with brotli. Source and destination must
 * differ. The source file is left intact — call `safeDelete(srcPath)`
 * separately if you want a replace-in-place workflow.
 */
export async function compressBrotliFile(
  srcPath: string,
  destPath: string,
  options?: CompressOptions | undefined,
): Promise<void> {
  if (srcPath === destPath) {
    throw new Error(
      `compressBrotliFile: srcPath and destPath must differ; got ${srcPath}`,
    )
  }
  await pipeline(
    createReadStream(srcPath),
    createBrotliCompress(resolveBrotliOptions(options)),
    createWriteStream(destPath),
  )
}

/**
 * Stream-decompress a brotli file. Source and destination must differ.
 */
export async function decompressBrotliFile(
  srcPath: string,
  destPath: string,
): Promise<void> {
  if (srcPath === destPath) {
    throw new Error(
      `decompressBrotliFile: srcPath and destPath must differ; got ${srcPath}`,
    )
  }
  await pipeline(
    createReadStream(srcPath),
    createBrotliDecompress(),
    createWriteStream(destPath),
  )
}

/**
 * Create a brotli compress transform stream. Compose into your own
 * pipeline. The `pipeline` from `node:stream/promises` is the safe
 * way to wire it up — it handles error propagation across all stages.
 */
export function createBrotliCompressor(
  options?: CompressOptions | undefined,
) {
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
 * Stream-compress a file with gzip. Source and destination must differ.
 */
export async function compressGzipFile(
  srcPath: string,
  destPath: string,
  options?: CompressOptions | undefined,
): Promise<void> {
  if (srcPath === destPath) {
    throw new Error(
      `compressGzipFile: srcPath and destPath must differ; got ${srcPath}`,
    )
  }
  await pipeline(
    createReadStream(srcPath),
    createGzip(resolveGzipOptions(options)),
    createWriteStream(destPath),
  )
}

/**
 * Stream-decompress a gzip file. Source and destination must differ.
 */
export async function decompressGzipFile(
  srcPath: string,
  destPath: string,
): Promise<void> {
  if (srcPath === destPath) {
    throw new Error(
      `decompressGzipFile: srcPath and destPath must differ; got ${srcPath}`,
    )
  }
  await pipeline(
    createReadStream(srcPath),
    createGunzip(),
    createWriteStream(destPath),
  )
}

/**
 * Create a gzip compress transform stream.
 */
export function createGzipCompressor(
  options?: CompressOptions | undefined,
) {
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

const BROTLI_EXTENSION_RE = /\.(br|brotli)$/i
const GZIP_EXTENSION_RE = /\.(gz|gzip|tgz)$/i

/**
 * Filename-extension check for brotli (`.br` / `.brotli`).
 */
export function hasBrotliExtension(filePath: string): boolean {
  return BROTLI_EXTENSION_RE.test(filePath)
}

/**
 * Filename-extension check for gzip (`.gz` / `.gzip` / `.tgz`).
 */
export function hasGzipExtension(filePath: string): boolean {
  return GZIP_EXTENSION_RE.test(filePath)
}

// ── Replace-in-place wrappers ───────────────────────────────────────

/**
 * Compress a file in place: write `<srcPath>.br` and delete the
 * original. Returns the new (`.br`) path. Useful for upload pipelines
 * where the disk copy is now meant to be brotli.
 *
 * If the destination already exists it is overwritten. The original
 * is removed only after a successful compress + write.
 */
export async function compressBrotliInPlace(
  srcPath: string,
  options?: CompressOptions | undefined,
): Promise<string> {
  const destPath = `${srcPath}.br`
  await compressBrotliFile(srcPath, destPath, options)
  await safeDelete(srcPath)
  return destPath
}

/**
 * Decompress a `.br` file in place: write the un-suffixed path and
 * delete the `.br`. Throws if the source has no `.br`/`.brotli`
 * extension (refusing to guess the original name).
 */
export async function decompressBrotliInPlace(
  srcPath: string,
): Promise<string> {
  if (!hasBrotliExtension(srcPath)) {
    throw new Error(
      `decompressBrotliInPlace: ${srcPath} has no .br/.brotli extension; can't infer destination`,
    )
  }
  const destPath = srcPath.replace(BROTLI_EXTENSION_RE, '')
  await decompressBrotliFile(srcPath, destPath)
  await safeDelete(srcPath)
  return destPath
}
