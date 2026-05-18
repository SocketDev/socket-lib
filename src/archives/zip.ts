/**
 * @file Zip extraction with security limits and path traversal validation. Uses
 *   adm-zip under the hood; pre-validates every entry before extraction so the
 *   disk-write phase can't be tricked into escaping the target directory.
 */

import { safeMkdir } from '../fs/safe'
import { normalizePath } from '../paths/normalize'
import { ArrayFrom, ArrayPrototypeSlice } from '../primordials/array'
import { ErrorCtor } from '../primordials/error'
import { SetCtor } from '../primordials/map-set'
import { PromiseAll } from '../primordials/promise'

import {
  assertArchiveExists,
  DEFAULT_MAX_ENTRIES,
  DEFAULT_MAX_FILE_SIZE,
  DEFAULT_MAX_TOTAL_SIZE,
  getAdmZip,
  getPath,
  validatePathWithinBase,
} from './_internal'

import type { ExtractOptions } from './types'

/**
 * Extract a zip archive to a directory.
 *
 * @example
 *   ;```typescript
 *   await extractZip('/tmp/archive.zip', '/tmp/output')
 *   await extractZip('/tmp/archive.zip', '/tmp/output', { strip: 1 })
 *   ```
 *
 * @param archivePath - Path to zip file.
 * @param outputDir - Directory to extract to.
 * @param options - Extraction options.
 */
export async function extractZip(
  archivePath: string,
  outputDir: string,
  options: ExtractOptions = {},
): Promise<void> {
  // Normalize the "missing archive" surface — throws ENOENT before
  // AdmZip can surface its generic "Invalid filename" message.
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

  const AdmZip = getAdmZip()
  const zip = new AdmZip(archivePath)
  const path = getPath()

  // Pre-validate all entries for security
  const entries = zip.getEntries()

  // entries.length>maxEntries fires only on archives crafted for the
  // DoS test; null-byte detection fires only on adversarial entries.
  // isDirectory branch fires on archives with directory entries.
  /* c8 ignore start */
  if (entries.length > maxEntries) {
    throw new ErrorCtor(
      `Archive has too many entries: ${entries.length} (limit: ${maxEntries})`,
    )
  }
  /* c8 ignore stop */

  let totalExtractedSize = 0

  for (const entry of entries) {
    if (entry.isDirectory) {
      continue
    }

    /* c8 ignore start */
    if (entry.entryName.includes('\0')) {
      throw new ErrorCtor(
        `Invalid null byte in archive entry name: ${entry.entryName}`,
      )
    }
    /* c8 ignore stop */

    // Check individual file size
    const uncompressedSize = entry.header.size
    if (uncompressedSize > maxFileSize) {
      throw new ErrorCtor(
        `File size exceeds limit: ${entry.entryName} (${uncompressedSize} bytes > ${maxFileSize} bytes)`,
      )
    }

    // Check total extracted size
    totalExtractedSize += uncompressedSize
    if (totalExtractedSize > maxTotalSize) {
      throw new ErrorCtor(
        `Total extracted size exceeds limit: ${totalExtractedSize} bytes > ${maxTotalSize} bytes`,
      )
    }

    // ZIP entries always use forward slashes per ZIP specification
    const parts = entry.entryName.split('/')
    if (parts.length <= strip) {
      continue
    }

    const strippedPath = ArrayPrototypeSlice(parts, strip).join('/')
    const targetPath = path.join(normalizedOutputDir, strippedPath)

    // Validate path is within target directory (prevents path traversal)
    validatePathWithinBase(targetPath, normalizedOutputDir, entry.entryName)
  }

  // strip===0 vs strip>0 cases tested separately; isDirectory arms
  // only fire on archives with directory entries (most don't).
  /* c8 ignore start */
  if (strip === 0) {
    for (const entry of entries) {
      if (!entry.isDirectory) {
        const targetPath = path.join(normalizedOutputDir, entry.entryName)
        validatePathWithinBase(targetPath, normalizedOutputDir, entry.entryName)
      }
    }

    zip.extractAllTo(normalizedOutputDir, true)
  } else {
    const path = getPath()
    const entries = zip.getEntries()

    const dirsToCreate = new SetCtor<string>()
    for (const entry of entries) {
      if (entry.isDirectory) {
        continue
      }

      // ZIP entries always use forward slashes per ZIP specification
      const parts = entry.entryName.split('/')
      if (parts.length <= strip) {
        continue
      }

      const strippedPath = ArrayPrototypeSlice(parts, strip).join('/')
      const targetPath = path.join(normalizedOutputDir, strippedPath)
      dirsToCreate.add(path.dirname(targetPath))
    }

    // Create all directories
    await PromiseAll(ArrayFrom(dirsToCreate).map(dir => safeMkdir(dir)))

    for (const entry of entries) {
      if (entry.isDirectory) {
        continue
      }

      const parts = entry.entryName.split('/')
      if (parts.length <= strip) {
        continue
      }

      const strippedPath = ArrayPrototypeSlice(parts, strip).join('/')
      const targetPath = path.join(normalizedOutputDir, strippedPath)

      zip.extractEntryTo(entry, path.dirname(targetPath), false, true)
    }
  }
  /* c8 ignore stop */
}
