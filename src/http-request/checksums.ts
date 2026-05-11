/**
 * @fileoverview Checksum file fetching + parsing for download
 * verification.
 *
 * `parseChecksums` understands the three common file shapes:
 *   - BSD style:   `SHA256 (filename) = hash`
 *   - GNU style:   `hash  filename`  (two spaces)
 *   - Simple:      `hash filename`   (single space)
 *
 * Comment lines (`#…`) and blank lines are skipped. Hashes are
 * lowercased.
 *
 * `fetchChecksums` is the URL helper — it fetches a checksums file
 * via `httpRequest` and runs the body through `parseChecksums`. The
 * pair lets `httpDownload({ sha256: checksums['file.zip'] })` keep
 * the verification logic close to the manifest source.
 */

import { ErrorCtor } from '../primordials/error'

import {
  StringPrototypeSplit,
  StringPrototypeStartsWith,
} from '../primordials/string'
import { httpRequest } from './request'

import type { Checksums, FetchChecksumsOptions } from './download-types'

const CHECKSUM_BSD_RE = /^SHA256\s+\((.+)\)\s+=\s+([a-fA-F0-9]{64})$/
const CHECKSUM_GNU_RE = /^([a-fA-F0-9]{64})\s+(.+)$/

/**
 * Fetch and parse a checksums file from a URL.
 *
 * This is useful for verifying downloads from GitHub releases which typically
 * publish a checksums.txt file alongside release assets.
 *
 * @param url - URL to the checksums file
 * @param options - Request options
 * @returns Map of filenames to lowercase SHA256 hashes
 * @throws {Error} When the checksums file cannot be fetched
 *
 * @example
 * ```ts
 * // Fetch checksums from GitHub release
 * const checksums = await fetchChecksums(
 *   'https://github.com/org/repo/releases/download/v1.0.0/checksums.txt'
 * )
 *
 * // Use with httpDownload
 * await httpDownload(
 *   'https://github.com/org/repo/releases/download/v1.0.0/tool_linux.tar.gz',
 *   '/tmp/tool.tar.gz',
 *   { sha256: checksums['tool_linux.tar.gz'] }
 * )
 * ```
 */
export async function fetchChecksums(
  url: string,
  options?: FetchChecksumsOptions | undefined,
): Promise<Checksums> {
  const {
    ca,
    headers = {},
    timeout = 30_000,
  } = {
    __proto__: null,
    ...options,
  } as FetchChecksumsOptions

  const response = await httpRequest(url, { ca, headers, timeout })

  if (!response.ok) {
    throw new ErrorCtor(
      `Failed to fetch checksums from ${url}: ${response.status} ${response.statusText}`,
    )
  }

  return parseChecksums(response.body.toString('utf8'))
}

/**
 * Parse a checksums file text into a filename-to-hash map.
 *
 * Supports standard checksums file formats:
 * - BSD style: "SHA256 (filename) = hash"
 * - GNU style: "hash  filename" (two spaces)
 * - Simple style: "hash filename" (single space)
 *
 * Lines starting with '#' are treated as comments and ignored.
 * Empty lines are ignored.
 *
 * @param text - Raw text content of a checksums file
 * @returns Map of filenames to lowercase SHA256 hashes
 *
 * @example
 * ```ts
 * const text = `
 * # SHA256 checksums
 * e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  file.zip
 * abc123def456...  other.tar.gz
 * `
 * const checksums = parseChecksums(text)
 * console.log(checksums['file.zip']) // 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
 * ```
 */
export function parseChecksums(text: string): Checksums {
  const checksums: Checksums = { __proto__: null } as unknown as Checksums

  for (const line of StringPrototypeSplit(text, '\n')) {
    const trimmed = line.trim()
    if (!trimmed || StringPrototypeStartsWith(trimmed, '#')) {
      continue
    }

    // Try BSD style: "SHA256 (filename) = hash"
    const bsdMatch = CHECKSUM_BSD_RE.exec(trimmed)
    if (bsdMatch) {
      checksums[bsdMatch[1]!] = bsdMatch[2]!.toLowerCase()
      continue
    }

    // Try GNU/simple style: "hash  filename" or "hash filename"
    const gnuMatch = CHECKSUM_GNU_RE.exec(trimmed)
    if (gnuMatch) {
      checksums[gnuMatch[2]!] = gnuMatch[1]!.toLowerCase()
    }
  }

  return checksums
}
