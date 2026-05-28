/* oxlint-disable socket/sort-source-methods -- functions ordered by call graph (compress/decompress variants share helpers); type / const declarations between them block autofix. */
/**
 * @file Gzip compression / decompression — same calling shapes as brotli:
 *   in-memory, file-to-file, and raw-stream variants. Default level is 6 (zlib
 *   default). The decompress-file helper recognises `.gz` / `.gzip` / `.tgz`,
 *   and special-cases `.tgz` back to `.tar` on inPlace decompress so a
 *   round-trip stays lossless. await compressGzip(JSON.stringify(payload))
 *   await compressGzipFile('input.json', 'input.json.gz')
 *   readable.pipe(createGzipCompressor()).pipe(writable)
 */

import { Buffer } from 'node:buffer'
import { createReadStream, createWriteStream } from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import {
  createGunzip,
  createGzip,
  gunzip,
  gzip,
  type ZlibOptions,
} from 'node:zlib'

import { safeDelete } from '../fs/safe'
import { ErrorCtor } from '../primordials/error'
import { StringPrototypeToLowerCase } from '../primordials/string'

import { resolveFileArgs, stripExt } from './_internal'

import type { CompressFileOptions, CompressOptions } from './types'

import { BufferFrom, BufferIsBuffer } from '../primordials/buffer'

import { SetCtor } from '../primordials/map-set'

const gzipAsync = promisify(gzip)
const gunzipAsync = promisify(gunzip)

/**
 * Translate `CompressOptions` into the `ZlibOptions` zlib expects. Returns an
 * empty options object when no `level` is given (zlib uses its default, level
 * 6). Exposed for parity with `resolveBrotliOptions` and for unit-test
 * coverage.
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

/**
 * Compress a string or Buffer with gzip. Strings are encoded as UTF-8 before
 * compression. Default level is 6 (zlib default).
 */
export async function compressGzip(
  input: string | Buffer,
  options?: CompressOptions | undefined,
): Promise<Buffer> {
  const buf = typeof input === 'string' ? BufferFrom!(input, 'utf8') : input
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
 * CompressGzipFile(src, dest, options?) Writes compressed output to `dest`.
 * Source is left intact.
 *
 * CompressGzipFile(src, { inPlace: true, ...options }) Writes to `<src>.gz` and
 * deletes `src` after the write succeeds. Returns the new path.
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
 * DecompressGzipFile(src, dest) Writes decompressed output to `dest`. Source is
 * left intact.
 *
 * DecompressGzipFile(src, { inPlace: true }) Strips the `.gz`/`.gzip`/`.tgz`
 * suffix to derive the destination, then deletes the compressed source after
 * the write succeeds. Throws if `src` has no recognizable extension.
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
        throw new ErrorCtor(
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

// Gzip has a real magic-byte signature: 0x1f 0x8b.
const GZIP_MAGIC_0 = 0x1f
const GZIP_MAGIC_1 = 0x8b

/**
 * Magic-byte check for gzip. Reads the first two bytes and matches the gzip
 * spec's 0x1f 0x8b signature. Authoritative.
 */
export function isGzipCompressed(input: Buffer): boolean {
  return (
    BufferIsBuffer!(input) &&
    input.byteLength >= 2 &&
    input[0] === GZIP_MAGIC_0 &&
    input[1] === GZIP_MAGIC_1
  )
}

// Exported so callers can introspect what counts as a "gzip"
// extension without re-implementing the list, and so tests can pin
// the recognized set.
export const GZIP_EXTS: ReadonlySet<string> = new SetCtor([
  '.gz',
  '.gzip',
  '.tgz',
])

/**
 * Extension check for gzip paths — matches `.gz` / `.gzip` / `.tgz`
 * (case-insensitive). Naming follows node:path's `extname`.
 */
export function hasGzipExt(filePath: string): boolean {
  return GZIP_EXTS.has(StringPrototypeToLowerCase(path.extname(filePath)))
}
