/**
 * @file Checksum file fetching + parsing for download verification.
 *   `parseChecksumFile` understands the three common text-file shapes:
 *
 *   - BSD style: `SHA256 (filename) = hash`
 *   - GNU style: `hash filename` (two spaces)
 *   - Simple: `hash filename` (single space) Comment lines (`#…`) and blank lines
 *     are skipped. Each hex digest is converted to an SRI integrity string
 *     (`sha256-<base64>=`) so callers always work in the same format as
 *     `external-tools.json` and other integrity-string consumers.
 *     `fetchChecksumFile` is the URL helper — fetches via `httpRequest` and
 *     runs the body through `parseChecksumFile`.
 */

import { checksumToIntegrity } from '../integrity'
import { ErrorCtor } from '../primordials/error'
import {
  StringPrototypeSplit,
  StringPrototypeStartsWith,
} from '../primordials/string'
import { httpRequest } from './request'

import type { ChecksumFile, FetchChecksumFileOptions } from './download-types'

// BSD `shasum -a 256` line: `SHA256 (<filename>) = <64-hex digest>`.
// Group 1 = filename (anything inside the parens), group 2 = the 64-char hex.
const CHECKSUM_BSD_RE = /^SHA256\s+\((.+)\)\s+=\s+([a-fA-F0-9]{64})$/
// GNU `sha256sum` line: `<64-hex digest>  <filename>`.
// Group 1 = the 64-char hex digest, group 2 = the filename (rest of line).
const CHECKSUM_GNU_RE = /^([a-fA-F0-9]{64})\s+(.+)$/

/**
 * Fetch and parse a checksums file from a URL.
 *
 * Returns a map of filenames to SRI integrity strings (`sha256-<base64>=`).
 * Feed `httpDownload({ sha256 })` by converting back to hex via
 * `integrityToChecksum()`; pass the SRI string through verbatim to consumers
 * that accept SRI directly.
 *
 * @example
 *   ;```ts
 *   import { integrityToChecksum } from '@socketsecurity/lib/integrity'
 *
 *   const sums = await fetchChecksumFile(
 *     'https://github.com/org/repo/releases/download/v1.0.0/checksums.txt',
 *   )
 *   await httpDownload(url, '/tmp/tool.tar.gz', {
 *     sha256: integrityToChecksum(sums['tool_linux.tar.gz']!),
 *   })
 *   ```
 */
export async function fetchChecksumFile(
  url: string,
  options?: FetchChecksumFileOptions | undefined,
): Promise<ChecksumFile> {
  const {
    ca,
    headers = {},
    timeout = 30_000,
  } = {
    __proto__: null,
    ...options,
  } as FetchChecksumFileOptions

  const response = await httpRequest(url, { ca, headers, timeout })

  if (!response.ok) {
    throw new ErrorCtor(
      `Failed to fetch checksums from ${url}: ${response.status} ${response.statusText}`,
    )
  }

  return parseChecksumFile(response.body.toString('utf8'))
}

/**
 * Parse a checksums file text into a filename-to-integrity map.
 *
 * Supports standard checksums file formats: - BSD style: `SHA256 (filename) =
 * hash` - GNU style: `hash filename` (two spaces) - Simple style: `hash
 * filename` (single space)
 *
 * Lines starting with `#` are treated as comments and ignored. Empty lines are
 * ignored. Each 64-char hex digest is converted to an SRI integrity string so
 * the result is uniform regardless of source format.
 *
 * @example
 *   ;```ts
 *   const sums = parseChecksumFile(
 *     'e3b0c44...  file.zip\nSHA256 (other.tar.gz) = abc123...\n',
 *   )
 *   // sums['file.zip'] === 'sha256-47DEQpj8HBSa+/...'
 *   ```
 */
export function parseChecksumFile(text: string): ChecksumFile {
  const result: ChecksumFile = { __proto__: null } as unknown as ChecksumFile

  for (const line of StringPrototypeSplit(text, '\n')) {
    const trimmed = line.trim()
    if (!trimmed || StringPrototypeStartsWith(trimmed, '#')) {
      continue
    }

    const bsdMatch = CHECKSUM_BSD_RE.exec(trimmed)
    if (bsdMatch) {
      result[bsdMatch[1]!] = checksumToIntegrity(bsdMatch[2]!.toLowerCase())
      continue
    }

    const gnuMatch = CHECKSUM_GNU_RE.exec(trimmed)
    if (gnuMatch) {
      result[gnuMatch[2]!] = checksumToIntegrity(gnuMatch[1]!.toLowerCase())
    }
  }

  return result
}
