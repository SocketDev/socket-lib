/**
 * @file Checksum file fetching + parsing for download verification.
 *   `parseChecksumFile` understands the three common text-file shapes:
 *
 *   - BSD style: `SHA256 (filename) = hash`
 *   - GNU style: `hash filename` with two spaces between them
 *   - Simple: `hash filename` with a single space between them Comment lines
 *     (`#…`) and blank lines are skipped. Each hex digest is converted to an
 *     SRI integrity string (`sha256-<base64>=`) so callers always work in the
 *     same format as `external-tools.json` and other integrity-string
 *     consumers. `fetchChecksumFile` is the URL helper — fetches via
 *     `httpRequest` and runs the body through `parseChecksumFile`.
 */

import { parseHash } from '../crypto/integrity.mjs'
import { ErrorCtor } from '../primordials/error.mjs'
import {
  StringPrototypeSplit,
  StringPrototypeStartsWith,
} from '../primordials/string.mjs'
import { httpRequest } from './request.mjs'

import type {
  ChecksumFile,
  FetchChecksumFileOptions,
} from './download-types.mjs'

// BSD `shasum -a 256` line: `SHA256 (<filename>) = <64-hex digest>`.
// Group 1 = the filename, whatever sits inside the parens. Group 2 = the
// 64-char hex.
const CHECKSUM_BSD_RE = /^SHA256\s+\((.+)\)\s+=\s+([a-fA-F0-9]{64})$/
// GNU `sha256sum` line: `<64-hex digest>  <filename>`.
// Group 1 = the 64-char hex digest, group 2 = the filename through end of line.
const CHECKSUM_GNU_RE = /^([a-fA-F0-9]{64})\s+(.+)$/

/**
 * Fetch and parse a checksums file from a URL.
 *
 * Returns a map of filenames to SRI integrity strings (`sha256-<base64>=`).
 * Feed `httpDownload({ sha256 })` by converting back to hex via
 * `parseHash(x).hex`; pass the SRI string through verbatim to consumers
 * that accept SRI directly.
 *
 * @example
 *   ;```ts
 *   import { parseHash } from '@socketsecurity/lib/crypto/integrity'
 *
 *   const sums = await fetchChecksumFile(
 *     'https://github.com/org/repo/releases/download/v1.0.0/checksums.txt',
 *   )
 *   await httpDownload(url, '/tmp/tool.tar.gz', {
 *     sha256: parseHash(sums['tool_linux.tar.gz']!).hex,
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
 * hash` - GNU style: `hash filename` with two spaces - Simple style: `hash
 * filename` with a single space.
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
      result[bsdMatch[1]!] = parseHash(bsdMatch[2]!.toLowerCase()).sri
      continue
    }

    const gnuMatch = CHECKSUM_GNU_RE.exec(trimmed)
    if (gnuMatch) {
      result[gnuMatch[2]!] = parseHash(gnuMatch[1]!.toLowerCase()).sri
    }
  }

  return result
}
