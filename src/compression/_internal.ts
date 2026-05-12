/* oxlint-disable socket/sort-source-methods -- internal helpers ordered by call graph; type/const declarations sandwiched between them block autofix. */
/**
 * @fileoverview Private internals for `compression/*` modules —
 * `resolveFileArgs` disambiguates the `(src, dest, options?)` vs
 * `(src, options)` calling shape, and `stripExt` removes a trailing
 * extension when it matches one of a caller-supplied set. Both are
 * shared by the brotli and gzip leaves and have no callers outside
 * this directory.
 */

import path from 'node:path'

import { ErrorCtor } from '../primordials/error'
import { StringPrototypeToLowerCase } from '../primordials/string'

import type { CompressFileOptions, CompressOptions } from './types'

/**
 * Strip the trailing extension from a filename when it matches one of
 * `exts`. Returns the input unchanged when the trailing extname isn't
 * in the set. Case-insensitive on the extension — preserves the rest
 * of the path's casing.
 *
 * The `exts` set decides what counts. Pass `BROTLI_EXTS` / `GZIP_EXTS`
 * for the canonical compression sets, or your own set for custom
 * classifiers.
 *
 * Generic — it does NOT know that `.tgz` is short for `.tar.gz`.
 * Callers that need that convention compose this with their own
 * follow-up (see `decompressGzipFile` for the canonical example).
 */
export function stripExt(filePath: string, exts: ReadonlySet<string>): string {
  const ext = path.extname(filePath)
  if (!exts.has(StringPrototypeToLowerCase(ext))) {
    return filePath
  }
  return filePath.slice(0, -ext.length)
}

export interface ResolvedFileArgs {
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
      throw new ErrorCtor(
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
  throw new ErrorCtor(
    `${fnName}: missing destPath; pass an explicit destination or { inPlace: true }`,
  )
}
