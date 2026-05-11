/**
 * @fileoverview Path/extension helpers shared by the brotli and gzip
 * file functions — `stripExt` for trailing-extension removal. The
 * recognized-extension sets live in the format-specific leaves
 * (`brotli.BROTLI_EXTS`, `gzip.GZIP_EXTS`); this helper accepts any
 * `ReadonlySet<string>` so callers can compose their own classifiers.
 */

import path from 'node:path'

import { StringPrototypeToLowerCase } from '../primordials/string'

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
