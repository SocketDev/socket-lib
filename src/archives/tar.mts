/**
 * @file Tar / tar.gz extraction with security limits and symlink rejection.
 *   Both functions share a `map(header)` callback that enforces:
 *
 *   - max entry count (inode-exhaustion DoS guard)
 *   - max single-file size
 *   - max total extracted size
 *   - rejection of null bytes in entry names
 *   - rejection of symlink / hardlink entries The duplicate map() bodies are
 *     intentional: the surrounding state (entryCount, totalExtractedSize,
 *     destroyScheduled) is per-call, so a shared helper would require threading
 *     state through closures and obscure the security-defense intent.
 */

import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'

import { safeMkdir } from '../fs/safe.mjs'
import { normalizePath } from '../paths/normalize.mjs'
import { ErrorCtor } from '../primordials/error.mjs'

import {
  assertArchiveExists,
  DEFAULT_MAX_ENTRIES,
  DEFAULT_MAX_FILE_SIZE,
  DEFAULT_MAX_TOTAL_SIZE,
  getTarFs,
} from './shared.mjs'

import type { ExtractOptions } from './types.mjs'
import { getNodeFs } from '../node/fs.mjs'
import { getNodeProcess } from '../node/process.mjs'

/**
 * Extract a tar archive to a directory.
 *
 * @example
 *   ;```typescript
 *   await extractTar('/tmp/archive.tar', '/tmp/output')
 *   await extractTar('/tmp/archive.tar', '/tmp/output', { strip: 1 })
 *   ```
 *
 * @param archivePath - Path to tar file.
 * @param outputDir - Directory to extract to.
 * @param options - Extraction options.
 */
export async function extractTar(
  archivePath: string,
  outputDir: string,
  options?: ExtractOptions | undefined,
): Promise<void> {
  // Normalize the "missing archive" surface (see extractZip) — throw
  // ENOENT up front with a clear message rather than letting the
  // Node-level getNodeFs().createReadStream eventually surface as a stream error.
  assertArchiveExists(archivePath)

  const {
    maxEntries = DEFAULT_MAX_ENTRIES,
    maxFileSize = DEFAULT_MAX_FILE_SIZE,
    maxTotalSize = DEFAULT_MAX_TOTAL_SIZE,
    strip = 0,
  } = { __proto__: null, ...options } as ExtractOptions

  // Normalize output directory path for cross-platform compatibility
  const normalizedOutputDir = normalizePath(outputDir)
  await safeMkdir(normalizedOutputDir)

  let totalExtractedSize = 0
  let entryCount = 0

  let destroyScheduled = false

  const tarFs = getTarFs()
  const extractStream = tarFs.extract(normalizedOutputDir, {
    map: (header: {
      name: string
      size?: number | undefined
      type?: string | undefined
    }) => {
      /* c8 ignore start - destroyScheduled is set by the same map() when a
         security limit trips; only fires after the schedule. */
      if (destroyScheduled) {
        return header
      }
      /* c8 ignore stop */

      /* c8 ignore start - Security-defense branches inside tar-fs
         map() schedule extractStream.destroy via getNodeProcess().nextTick.
         tar-fs@3.1.2 has an async-cleanup race after destroy that
         crashes the vitest pool runner. Re-enable once tar-fs is
         upgraded or the SUT refactors destroy. */
      // Check entry count to prevent inode exhaustion DoS.
      entryCount += 1
      if (entryCount > maxEntries) {
        destroyScheduled = true
        const nodeProcess = getNodeProcess()
        nodeProcess.nextTick(() => {
          extractStream.destroy(
            new ErrorCtor(
              `Archive has too many entries: exceeded limit of ${maxEntries}`,
            ),
          )
        })
        return header
      }

      // Reject entries with null bytes in names as defense in depth.
      if (header.name.includes('\0')) {
        destroyScheduled = true
        const nodeProcess = getNodeProcess()
        nodeProcess.nextTick(() => {
          extractStream.destroy(
            new ErrorCtor(
              `Invalid null byte in archive entry name: ${header.name}`,
            ),
          )
        })
        return header
      }

      // Check for symlinks
      if (header.type === 'link' || header.type === 'symlink') {
        destroyScheduled = true
        const nodeProcess = getNodeProcess()
        nodeProcess.nextTick(() => {
          extractStream.destroy(
            new ErrorCtor(
              `Symlink detected in archive: ${header.name}. Symlinks are not supported for security reasons.`,
            ),
          )
        })
        return header
      }

      // Check individual file size
      if (header.size && header.size > maxFileSize) {
        destroyScheduled = true
        const nodeProcess = getNodeProcess()
        nodeProcess.nextTick(() => {
          extractStream.destroy(
            new ErrorCtor(
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
          const nodeProcess = getNodeProcess()
          nodeProcess.nextTick(() => {
            extractStream.destroy(
              new ErrorCtor(
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

  const fs = getNodeFs()
  const readStream = fs.createReadStream(archivePath)

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
 * @example
 *   ;```typescript
 *   await extractTarGz('/tmp/archive.tar.gz', '/tmp/output')
 *   await extractTarGz('/tmp/archive.tgz', '/tmp/output', { strip: 1 })
 *   ```
 *
 * @param archivePath - Path to tar.gz or tgz file.
 * @param outputDir - Directory to extract to.
 * @param options - Extraction options.
 */
export async function extractTarGz(
  archivePath: string,
  outputDir: string,
  options?: ExtractOptions | undefined,
): Promise<void> {
  // Normalize the "missing archive" surface (see extractZip).
  assertArchiveExists(archivePath)

  const {
    maxEntries = DEFAULT_MAX_ENTRIES,
    maxFileSize = DEFAULT_MAX_FILE_SIZE,
    maxTotalSize = DEFAULT_MAX_TOTAL_SIZE,
    strip = 0,
  } = { __proto__: null, ...options } as ExtractOptions

  // Normalize output directory path for cross-platform compatibility
  const normalizedOutputDir = normalizePath(outputDir)
  await safeMkdir(normalizedOutputDir)

  let totalExtractedSize = 0
  let entryCount = 0

  let destroyScheduled = false

  const tarFs = getTarFs()
  const extractStream = tarFs.extract(normalizedOutputDir, {
    map: (header: {
      name: string
      size?: number | undefined
      type?: string | undefined
    }) => {
      /* c8 ignore start - destroyScheduled is set by the same map() when a
         security limit trips; only fires after the schedule. */
      if (destroyScheduled) {
        return header
      }
      /* c8 ignore stop */

      /* c8 ignore start - Security-defense branches inside tar-fs
         map() schedule extractStream.destroy via getNodeProcess().nextTick.
         tar-fs@3.1.2 has an async-cleanup race after destroy that
         crashes the vitest pool runner. Re-enable once tar-fs is
         upgraded or the SUT refactors destroy. */
      // Check entry count to prevent inode exhaustion DoS.
      entryCount += 1
      if (entryCount > maxEntries) {
        destroyScheduled = true
        const nodeProcess = getNodeProcess()
        nodeProcess.nextTick(() => {
          extractStream.destroy(
            new ErrorCtor(
              `Archive has too many entries: exceeded limit of ${maxEntries}`,
            ),
          )
        })
        return header
      }

      // Reject entries with null bytes in names as defense in depth.
      if (header.name.includes('\0')) {
        destroyScheduled = true
        const nodeProcess = getNodeProcess()
        nodeProcess.nextTick(() => {
          extractStream.destroy(
            new ErrorCtor(
              `Invalid null byte in archive entry name: ${header.name}`,
            ),
          )
        })
        return header
      }

      // Check for symlinks
      if (header.type === 'link' || header.type === 'symlink') {
        destroyScheduled = true
        const nodeProcess = getNodeProcess()
        nodeProcess.nextTick(() => {
          extractStream.destroy(
            new ErrorCtor(
              `Symlink detected in archive: ${header.name}. Symlinks are not supported for security reasons.`,
            ),
          )
        })
        return header
      }

      // Check individual file size
      if (header.size && header.size > maxFileSize) {
        destroyScheduled = true
        const nodeProcess = getNodeProcess()
        nodeProcess.nextTick(() => {
          extractStream.destroy(
            new ErrorCtor(
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
          const nodeProcess = getNodeProcess()
          nodeProcess.nextTick(() => {
            extractStream.destroy(
              new ErrorCtor(
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

  const fs = getNodeFs()
  const readStream = fs.createReadStream(archivePath)

  try {
    await pipeline(readStream, createGunzip(), extractStream)
  } catch (e) {
    // Ensure stream is cleaned up on error
    readStream.destroy()
    throw e
  }
}
