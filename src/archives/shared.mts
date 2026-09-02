/**
 * @file Private internals for `archives/*` modules — defaults, lazy module
 *   accessors (adm-zip, tar-fs, node:path), shared pre-extraction validators
 *   (`assertArchiveExists`, `validatePathWithinBase`).
 */

import { ErrorCtor } from '../primordials/error.mjs'
import { StringPrototypeStartsWith } from '../primordials/string.mjs'

import type AdmZipType from '../external/adm-zip.js'
import type tarFsType from '../external/tar-fs.js'

// Re-exported so the `archives/*` modules keep importing their defaults from
// one place. They LIVE in `./types` because that module imports nothing, which
// lets the browser-side npm tarball reader share them; this one reaches
// `node:fs` and cannot be on a browser path.
export {
  DEFAULT_MAX_ENTRIES,
  DEFAULT_MAX_FILE_SIZE,
  DEFAULT_MAX_TOTAL_SIZE,
} from './types.mjs'

let admZip: typeof AdmZipType | undefined
let tarFs: typeof tarFsType | undefined

import { getNodePath } from '../node/path.mjs'
import { getNodeFs } from '../node/fs.mjs'

/**
 * Assert that an archive file exists on disk before handing it to the
 * underlying extractor. Normalizes the "missing archive" surface across all
 * three extractors (zip/tar/tar.gz): each now throws a Node-style `ENOENT`
 * error with the archive path. Without this preflight, `zip` goes through
 * adm-zip and surfaces as `"Invalid filename"`, while `tar`/`tar.gz` surface
 * the raw Node `ENOENT` — inconsistent, and adm-zip's message didn't include
 * the path.
 *
 * @private
 *
 * @throws Error with `code: 'ENOENT'` if archivePath doesn't exist.
 */
export function assertArchiveExists(archivePath: string): void {
  const fs = getNodeFs()
  if (!fs.existsSync(archivePath)) {
    const err = new ErrorCtor(
      `ENOENT: no such file or directory, open '${archivePath}'`,
    ) as Error & { code: string; path: string }
    err.code = 'ENOENT'
    err.path = archivePath
    throw err
  }
}

export function getAdmZip() {
  if (admZip === undefined) {
    admZip = /*@__PURE__*/ require('../external/adm-zip.js')
  }
  return admZip!
}

export function getTarFs() {
  if (tarFs === undefined) {
    tarFs = /*@__PURE__*/ require('../external/tar-fs.js')
  }
  return tarFs!
}

/**
 * Validate that a resolved path is within the target directory. Prevents path
 * traversal attacks.
 *
 * @private
 *
 * @param targetPath - The resolved path to validate.
 * @param baseDir - The base directory that should contain the path.
 * @param entryName - Original entry name for error reporting.
 *
 * @throws Error if path is outside the base directory
 */
export function validatePathWithinBase(
  targetPath: string,
  baseDir: string,
  entryName: string,
): void {
  const path = getNodePath()
  const resolvedTarget = path.resolve(targetPath)
  const resolvedBase = path.resolve(baseDir)

  // Ensure target path starts with base directory + separator
  // This prevents attacks like /base/dir vs /base/dir-sibling
  if (
    !StringPrototypeStartsWith(resolvedTarget, resolvedBase + path.sep) &&
    resolvedTarget !== resolvedBase
  ) {
    throw new ErrorCtor(
      `Path traversal attempt detected: entry "${entryName}" would extract to "${resolvedTarget}" outside target directory "${resolvedBase}"`,
    )
  }
}
