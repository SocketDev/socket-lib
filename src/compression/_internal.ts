/**
 * @fileoverview Private internals for `compression/*` modules —
 * `resolveFileArgs` disambiguates the `(src, dest, options?)` vs
 * `(src, options)` calling shape that every `*File` helper accepts.
 * Lives here because both brotli and gzip leaves consume it, and it
 * has no caller outside this directory.
 */

import type { CompressFileOptions, CompressOptions } from './types'

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
