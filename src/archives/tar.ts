/**
 * @fileoverview Tar / tar.gz extraction with security limits and
 * symlink rejection. Both functions share a `map(header)` callback
 * that enforces:
 *
 *   - max entry count (inode-exhaustion DoS guard)
 *   - max single-file size
 *   - max total extracted size
 *   - rejection of null bytes in entry names
 *   - rejection of symlink / hardlink entries
 *
 * The duplicate map() bodies are intentional: the surrounding state
 * (entryCount, totalExtractedSize, destroyScheduled) is per-call, so
 * a shared helper would require threading state through closures and
 * obscure the security-defense intent.
 */

import { createReadStream } from 'node:fs'
import process from 'node:process'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'

import { safeMkdir } from '../fs/safe'
import { normalizePath } from '../paths/normalize'

import {
  assertArchiveExists,
  DEFAULT_MAX_ENTRIES,
  DEFAULT_MAX_FILE_SIZE,
  DEFAULT_MAX_TOTAL_SIZE,
  getTarFs,
} from './_internals'

import type { ExtractOptions } from './types'

/**
 * Extract a tar archive to a directory.
 *
 * @param archivePath - Path to tar file
 * @param outputDir - Directory to extract to
 * @param options - Extraction options
 *
 * @example
 * ```typescript
 * await extractTar('/tmp/archive.tar', '/tmp/output')
 * await extractTar('/tmp/archive.tar', '/tmp/output', { strip: 1 })
 * ```
 */
export async function extractTar(
  archivePath: string,
  outputDir: string,
  options: ExtractOptions = {},
): Promise<void> {
  // Normalize the "missing archive" surface (see extractZip) — throw
  // ENOENT up front with a clear message rather than letting the
  // Node-level createReadStream eventually surface as a stream error.
  assertArchiveExists(archivePath)

  const {
    maxEntries = DEFAULT_MAX_ENTRIES,
    maxFileSize = DEFAULT_MAX_FILE_SIZE,
    maxTotalSize = DEFAULT_MAX_TOTAL_SIZE,
    strip = 0,
  } = options

  // Normalize output directory path for cross-platform compatibility
  const normalizedOutputDir = normalizePath(outputDir)
  await safeMkdir(normalizedOutputDir)

  let totalExtractedSize = 0
  let entryCount = 0

  let destroyScheduled = false

  const tarFs = getTarFs()
  const extractStream = tarFs.extract(normalizedOutputDir, {
    map: (header: { name: string; size?: number; type?: string }) => {
      // Skip if destroy already scheduled
      /* c8 ignore next 3 - destroyScheduled is set by the same map()
         when a security limit trips; only fires after the schedule. */
      if (destroyScheduled) {
        return header
      }

      /* c8 ignore start - Security-defense branches inside tar-fs
         map() schedule extractStream.destroy via process.nextTick.
         tar-fs@3.1.2 has an async-cleanup race after destroy that
         crashes the vitest pool runner. Re-enable once tar-fs is
         upgraded or the SUT refactors destroy. */
      // Check entry count to prevent inode exhaustion DoS.
      entryCount += 1
      if (entryCount > maxEntries) {
        destroyScheduled = true
        process.nextTick(() => {
          extractStream.destroy(
            new Error(
              `Archive has too many entries: exceeded limit of ${maxEntries}`,
            ),
          )
        })
        return header
      }

      // Reject entries with null bytes in names (defense in depth).
      if (header.name.includes('\0')) {
        destroyScheduled = true
        process.nextTick(() => {
          extractStream.destroy(
            new Error(
              `Invalid null byte in archive entry name: ${header.name}`,
            ),
          )
        })
        return header
      }

      // Check for symlinks
      if (header.type === 'symlink' || header.type === 'link') {
        destroyScheduled = true
        process.nextTick(() => {
          extractStream.destroy(
            new Error(
              `Symlink detected in archive: ${header.name}. Symlinks are not supported for security reasons.`,
            ),
          )
        })
        return header
      }

      // Check individual file size
      if (header.size && header.size > maxFileSize) {
        destroyScheduled = true
        process.nextTick(() => {
          extractStream.destroy(
            new Error(
              `File size exceeds limit: ${header.name} (${header.size} bytes > ${maxFileSize} bytes)`,
            ),
          )
        })
        return header
      }

      // Check total extracted size
      if (header.size) {
        totalExtractedSize += header.size
        if (totalExtractedSize > maxTotalSize) {
          destroyScheduled = true
          process.nextTick(() => {
            extractStream.destroy(
              new Error(
                `Total extracted size exceeds limit: ${totalExtractedSize} bytes > ${maxTotalSize} bytes`,
              ),
            )
          })
          return header
        }
      }
      /* c8 ignore stop */

      return header
    },
    strip,
  })

  // Attach error handler before starting pipeline to catch errors
  extractStream.on('error', () => {
    // Error will be caught by pipeline
  })

  const readStream = createReadStream(archivePath)

  try {
    await pipeline(readStream, extractStream)
  } catch (e) {
    // Ensure stream is cleaned up on error
    readStream.destroy()
    throw e
  }
}

/**
 * Extract a gzipped tar archive to a directory.
 *
 * @param archivePath - Path to tar.gz or tgz file
 * @param outputDir - Directory to extract to
 * @param options - Extraction options
 *
 * @example
 * ```typescript
 * await extractTarGz('/tmp/archive.tar.gz', '/tmp/output')
 * await extractTarGz('/tmp/archive.tgz', '/tmp/output', { strip: 1 })
 * ```
 */
export async function extractTarGz(
  archivePath: string,
  outputDir: string,
  options: ExtractOptions = {},
): Promise<void> {
  // Normalize the "missing archive" surface (see extractZip).
  assertArchiveExists(archivePath)

  const {
    maxEntries = DEFAULT_MAX_ENTRIES,
    maxFileSize = DEFAULT_MAX_FILE_SIZE,
    maxTotalSize = DEFAULT_MAX_TOTAL_SIZE,
    strip = 0,
  } = options

  // Normalize output directory path for cross-platform compatibility
  const normalizedOutputDir = normalizePath(outputDir)
  await safeMkdir(normalizedOutputDir)

  let totalExtractedSize = 0
  let entryCount = 0

  let destroyScheduled = false

  const tarFs = getTarFs()
  const extractStream = tarFs.extract(normalizedOutputDir, {
    map: (header: { name: string; size?: number; type?: string }) => {
      // Skip if destroy already scheduled
      /* c8 ignore next 3 - destroyScheduled is set by the same map()
         when a security limit trips; only fires after the schedule. */
      if (destroyScheduled) {
        return header
      }

      /* c8 ignore start - Security-defense branches inside tar-fs
         map() schedule extractStream.destroy via process.nextTick.
         tar-fs@3.1.2 has an async-cleanup race after destroy that
         crashes the vitest pool runner. Re-enable once tar-fs is
         upgraded or the SUT refactors destroy. */
      // Check entry count to prevent inode exhaustion DoS.
      entryCount += 1
      if (entryCount > maxEntries) {
        destroyScheduled = true
        process.nextTick(() => {
          extractStream.destroy(
            new Error(
              `Archive has too many entries: exceeded limit of ${maxEntries}`,
            ),
          )
        })
        return header
      }

      // Reject entries with null bytes in names (defense in depth).
      if (header.name.includes('\0')) {
        destroyScheduled = true
        process.nextTick(() => {
          extractStream.destroy(
            new Error(
              `Invalid null byte in archive entry name: ${header.name}`,
            ),
          )
        })
        return header
      }

      // Check for symlinks
      if (header.type === 'symlink' || header.type === 'link') {
        destroyScheduled = true
        process.nextTick(() => {
          extractStream.destroy(
            new Error(
              `Symlink detected in archive: ${header.name}. Symlinks are not supported for security reasons.`,
            ),
          )
        })
        return header
      }

      // Check individual file size
      if (header.size && header.size > maxFileSize) {
        destroyScheduled = true
        process.nextTick(() => {
          extractStream.destroy(
            new Error(
              `File size exceeds limit: ${header.name} (${header.size} bytes > ${maxFileSize} bytes)`,
            ),
          )
        })
        return header
      }

      // Check total extracted size
      if (header.size) {
        totalExtractedSize += header.size
        if (totalExtractedSize > maxTotalSize) {
          destroyScheduled = true
          process.nextTick(() => {
            extractStream.destroy(
              new Error(
                `Total extracted size exceeds limit: ${totalExtractedSize} bytes > ${maxTotalSize} bytes`,
              ),
            )
          })
          return header
        }
      }
      /* c8 ignore stop */

      return header
    },
    strip,
  })

  // Attach error handler before starting pipeline to catch errors
  extractStream.on('error', () => {
    // Error will be caught by pipeline
  })

  const readStream = createReadStream(archivePath)

  try {
    await pipeline(readStream, createGunzip(), extractStream)
  } catch (e) {
    // Ensure stream is cleaned up on error
    readStream.destroy()
    throw e
  }
}
