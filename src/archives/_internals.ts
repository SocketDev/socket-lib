/**
 * @fileoverview Private internals for `archives/*` modules — defaults,
 * lazy module accessors (adm-zip, tar-fs, node:path), shared
 * pre-extraction validators (`assertArchiveExists`,
 * `validatePathWithinBase`).
 */

import { existsSync } from 'node:fs'

import { ErrorCtor } from '../primordials/error'
import { StringPrototypeStartsWith } from '../primordials/string'

import type AdmZipType from '../external/adm-zip'
import type tarFsType from '../external/tar-fs'

// 100MB
export const DEFAULT_MAX_FILE_SIZE = 100 * 1024 * 1024
// 1GB
export const DEFAULT_MAX_TOTAL_SIZE = 1024 * 1024 * 1024
// Maximum number of entries to prevent inode exhaustion DoS.
export const DEFAULT_MAX_ENTRIES = 100_000

let _AdmZip: typeof AdmZipType | undefined
let _tarFs: typeof tarFsType | undefined
let _path: typeof import('node:path') | undefined

/*@__NO_SIDE_EFFECTS__*/
export function getAdmZip() {
  if (_AdmZip === undefined) {
    _AdmZip = /*@__PURE__*/ require('../external/adm-zip.js')
  }
  return _AdmZip!
}

/**
 * Lazily load the path module to avoid Webpack errors.
 *
 * @private
 */
/*@__NO_SIDE_EFFECTS__*/
export function getPath() {
  if (_path === undefined) {
    _path = /*@__PURE__*/ require('node:path')
  }
  return _path as typeof import('node:path')
}

/*@__NO_SIDE_EFFECTS__*/
export function getTarFs() {
  if (_tarFs === undefined) {
    _tarFs = /*@__PURE__*/ require('../external/tar-fs.js')
  }
  return _tarFs!
}

/**
 * Validate that a resolved path is within the target directory.
 * Prevents path traversal attacks.
 *
 * @param targetPath - The resolved path to validate
 * @param baseDir - The base directory that should contain the path
 * @param entryName - Original entry name for error reporting
 * @throws Error if path is outside the base directory
 * @private
 */
export function validatePathWithinBase(
  targetPath: string,
  baseDir: string,
  entryName: string,
): void {
  const path = getPath()
  const resolvedTarget = path.resolve(targetPath)
  const resolvedBase = path.resolve(baseDir)

  // Ensure target path starts with base directory + separator
  // This prevents attacks like /base/dir vs /base/dir-evil
  if (
    !StringPrototypeStartsWith(resolvedTarget, resolvedBase + path.sep) &&
    resolvedTarget !== resolvedBase
  ) {
    throw new ErrorCtor(
      `Path traversal attempt detected: entry "${entryName}" would extract to "${resolvedTarget}" outside target directory "${resolvedBase}"`,
    )
  }
}

/**
 * Assert that an archive file exists on disk before handing it to the
 * underlying extractor. Normalizes the "missing archive" surface across
 * all three extractors (zip/tar/tar.gz): each now throws a Node-style
 * `ENOENT` error with the archive path. Without this preflight, `zip`
 * goes through adm-zip and surfaces as `"Invalid filename"`, while
 * `tar`/`tar.gz` surface the raw Node `ENOENT` — inconsistent, and
 * adm-zip's message didn't include the path.
 *
 * @throws Error with `code: 'ENOENT'` if archivePath doesn't exist.
 * @private
 */
export function assertArchiveExists(archivePath: string): void {
  if (!existsSync(archivePath)) {
    const err = new ErrorCtor(
      `ENOENT: no such file or directory, open '${archivePath}'`,
    ) as Error & { code: string; path: string }
    err.code = 'ENOENT'
    err.path = archivePath
    throw err
  }
}
