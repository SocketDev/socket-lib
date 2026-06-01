/* oxlint-disable socket/sort-source-methods -- functions ordered by call graph (compress/decompress variants share helpers); type / const declarations between them block autofix. */
/**
 * @file Brotli compression / decompression — in-memory, file-to-file, and
 *   raw-stream variants. Default quality is 11 (max compression, slow) on the
 *   assumption these are one-shot CLI calls. Override via `options.level` for
 *   hot paths. await compressBrotli(JSON.stringify(payload)) await
 *   compressBrotliFile('input.json', 'input.json.br')
 *   readable.pipe(createBrotliCompressor()).pipe(writable)
 */

import type { Buffer } from 'node:buffer'
import { createReadStream, createWriteStream } from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import {
  brotliCompress,
  brotliDecompress,
  constants as zlibConstants,
  createBrotliCompress,
  createBrotliDecompress,
} from 'node:zlib'
import type { BrotliOptions } from 'node:zlib'

import { safeDelete } from '../fs/safe'
import { ErrorCtor } from '../primordials/error'
import { StringPrototypeToLowerCase } from '../primordials/string'

import { resolveFileArgs, stripExt } from './_internal'

import type { CompressFileOptions, CompressOptions } from './types'

import { BufferFrom, BufferIsBuffer } from '../primordials/buffer'

import { SetCtor } from '../primordials/map-set'

const brotliCompressAsync = promisify(brotliCompress)
const brotliDecompressAsync = promisify(brotliDecompress)

interface ResolvedBrotliOptions extends BrotliOptions {
  params: NonNullable<BrotliOptions['params']>
}

/**
 * Translate `CompressOptions` into the `BrotliOptions` zlib expects. Defaults
 * `quality` to 11 (max) when not provided, and forwards a positive `size` hint.
 * Exposed for callers building their own zlib pipelines and for unit-test
 * coverage.
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
 * Compress a string or Buffer with brotli. Strings are encoded as UTF-8 before
 * compression — pass an explicit Buffer if you have non-UTF-8 input.
 */
export async function compressBrotli(
  input: string | Buffer,
  options?: CompressOptions | undefined,
): Promise<Buffer> {
  const buf = typeof input === 'string' ? BufferFrom!(input, 'utf8') : input
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
 * CompressBrotliFile(src, dest, options?) Writes compressed output to `dest`.
 * Source is left intact.
 *
 * CompressBrotliFile(src, { inPlace: true, ...options }) Writes to `<src>.br`
 * and deletes `src` after the write succeeds. Returns the new path.
 *
 * Returns the destination path in both shapes — same string the caller passed
 * in or the computed `.br` path for inPlace.
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
 * DecompressBrotliFile(src, dest) Writes decompressed output to `dest`. Source
 * is left intact.
 *
 * DecompressBrotliFile(src, { inPlace: true }) Strips the `.br`/`.brotli`
 * suffix to derive the destination, then deletes the compressed source after
 * the write succeeds. Throws if `src` has no recognizable extension.
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
        throw new ErrorCtor(
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
 * Create a brotli compress transform stream. Compose into your own pipeline.
 * The `pipeline` from `node:stream/promises` is the safe way to wire it up — it
 * handles error propagation across all stages.
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
 * Cheap pre-flight check: does the buffer look like it could be brotli? Returns
 * false for inputs too short to be valid. Brotli has no fixed magic bytes, so
 * this is intentionally permissive — the authoritative test is
 * `decompressBrotli(buf)` succeeding. Use for UI hints, not correctness.
 */
export function isBrotliCompressed(input: Buffer): boolean {
  return BufferIsBuffer!(input) && input.byteLength >= BROTLI_MIN_LEN
}

// Use Sets — O(1) lookup, sorted alphanumerically per CLAUDE.md so
// adding a new extension stays a one-line append. node:path's extname
// is case-sensitive (it reflects the OS path semantics), but our
// extension classifier is policy: ".BR" should classify the same as
// ".br" regardless of host OS. Lowercase the extname before lookup.
//
// Exported so callers can introspect what counts as a "brotli"
// extension without re-implementing the list, and so tests can pin
// the recognized set.
export const BROTLI_EXTS: ReadonlySet<string> = new SetCtor(['.br', '.brotli'])

/**
 * Extension check for brotli paths — matches `.br` / `.brotli`
 * (case-insensitive). Naming follows node:path's `extname`.
 */
export function hasBrotliExt(filePath: string): boolean {
  return BROTLI_EXTS.has(StringPrototypeToLowerCase(path.extname(filePath)))
}
