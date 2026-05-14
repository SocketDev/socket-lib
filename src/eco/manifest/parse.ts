/**
 * @fileoverview `parse(filename, content)` — auto-detects format
 * from filename then dispatches to `parseManifest` or
 * `parseLockfile`.
 *
 * Throws `ManifestError(ERR_UNKNOWN_FORMAT)` when the filename
 * doesn't match any recognized manifest or lockfile basename.
 */

import { ManifestError } from './manifest-error'
import { detectFormat } from './detect-format'
import { parseLockfile } from './parse-lockfile'
import { parseManifest } from './parse-manifest'
import { getSmolManifest } from '../../smol/manifest'

import type { ParsedLockfile, ParsedManifest } from './types'

export function jsParse(
  filename: string,
  content: string,
): ParsedManifest | ParsedLockfile {
  const format = detectFormat(filename)
  if (!format) {
    throw new ManifestError(
      `Unknown file format: ${filename}`,
      'ERR_UNKNOWN_FORMAT',
    )
  }
  if (format.type === 'manifest') {
    return parseManifest(content, format.ecosystem)
  }
  return parseLockfile(content, format.ecosystem, format.format)
}

const _smol = getSmolManifest()

export const parse: (
  filename: string,
  content: string,
) => ParsedManifest | ParsedLockfile = _smol
  ? (filename: string, content: string) =>
      _smol.parse(filename, content) as ParsedManifest | ParsedLockfile
  : jsParse
