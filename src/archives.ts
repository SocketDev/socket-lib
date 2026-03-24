/**
 * @fileoverview Generic archive extraction utilities.
 * Supports zip, tar, tar.gz, and tgz formats.
 */

import { createReadStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'
import process from 'node:process'

import AdmZip from './external/adm-zip.js'
import tarFs from './external/tar-fs.js'

import { safeMkdir } from './fs.js'
import { normalizePath } from './paths/normalize.js'

let _path: typeof import('node:path') | undefined

/**
 * Lazily load the path module to avoid Webpack errors.
 *
 * @private
 */
/*@__NO_SIDE_EFFECTS__*/
function getPath() {
  if (_path === undefined) {
    _path = /*@__PURE__*/ require('path')
  }
  return _path as typeof import('node:path')
}

/**
 * Archive format type.
 */
export type ArchiveFormat = 'tar' | 'tar.gz' | 'tgz' | 'zip'

/**
 * Options for archive extraction.
 */
export interface ExtractOptions {
  /** Suppress log messages */
  quiet?: boolean
  /** Strip leading path components (like tar --strip-components) */
  strip?: number
  /** Maximum size of a single extracted file in bytes (default: 100MB) */
  maxFileSize?: number
  /** Maximum total extracted size in bytes (default: 1GB) */
  maxTotalSize?: number
}

/**
 * Default extraction limits to prevent zip bombs and DoS attacks.
 */
// 100MB
const DEFAULT_MAX_FILE_SIZE = 100 * 1024 * 1024
// 1GB
const DEFAULT_MAX_TOTAL_SIZE = 1024 * 1024 * 1024

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
function validatePathWithinBase(
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
    !resolvedTarget.startsWith(resolvedBase + path.sep) &&
    resolvedTarget !== resolvedBase
  ) {
    throw new Error(
      `Path traversal attempt detected: entry "${entryName}" would extract to "${resolvedTarget}" outside target directory "${resolvedBase}"`,
    )
  }
}

/**
 * Detect archive format from file path.
 *
 * @param filePath - Path to archive file
 * @returns Archive format or null if unknown
 */
export function detectArchiveFormat(filePath: string): ArchiveFormat | null {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.tar.gz')) {
    return 'tar.gz'
  }
  if (lower.endsWith('.tgz')) {
    return 'tgz'
  }
  if (lower.endsWith('.tar')) {
    return 'tar'
  }
  if (lower.endsWith('.zip')) {
    return 'zip'
  }
  return null
}

/**
 * Extract a tar archive to a directory.
 *
 * @param archivePath - Path to tar file
 * @param outputDir - Directory to extract to
 * @param options - Extraction options
 */
export async function extractTar(
  archivePath: string,
  outputDir: string,
  options: ExtractOptions = {},
): Promise<void> {
  const {
    maxFileSize = DEFAULT_MAX_FILE_SIZE,
    maxTotalSize = DEFAULT_MAX_TOTAL_SIZE,
    strip = 0,
  } = options

  // Normalize output directory path for cross-platform compatibility
  const normalizedOutputDir = normalizePath(outputDir)
  await safeMkdir(normalizedOutputDir)

  let totalExtractedSize = 0

  let destroyScheduled = false

  const extractStream = tarFs.extract(normalizedOutputDir, {
    map: (header: { name: string; size?: number; type?: string }) => {
      // Skip if destroy already scheduled
      if (destroyScheduled) {
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
  } catch (error) {
    // Ensure stream is cleaned up on error
    readStream.destroy()
    throw error
  }
}

/**
 * Extract a gzipped tar archive to a directory.
 *
 * @param archivePath - Path to tar.gz or tgz file
 * @param outputDir - Directory to extract to
 * @param options - Extraction options
 */
export async function extractTarGz(
  archivePath: string,
  outputDir: string,
  options: ExtractOptions = {},
): Promise<void> {
  const {
    maxFileSize = DEFAULT_MAX_FILE_SIZE,
    maxTotalSize = DEFAULT_MAX_TOTAL_SIZE,
    strip = 0,
  } = options

  // Normalize output directory path for cross-platform compatibility
  const normalizedOutputDir = normalizePath(outputDir)
  await safeMkdir(normalizedOutputDir)

  let totalExtractedSize = 0

  let destroyScheduled = false

  const extractStream = tarFs.extract(normalizedOutputDir, {
    map: (header: { name: string; size?: number; type?: string }) => {
      // Skip if destroy already scheduled
      if (destroyScheduled) {
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
  } catch (error) {
    // Ensure stream is cleaned up on error
    readStream.destroy()
    throw error
  }
}

/**
 * Extract a zip archive to a directory.
 *
 * @param archivePath - Path to zip file
 * @param outputDir - Directory to extract to
 * @param options - Extraction options
 */
export async function extractZip(
  archivePath: string,
  outputDir: string,
  options: ExtractOptions = {},
): Promise<void> {
  const {
    maxFileSize = DEFAULT_MAX_FILE_SIZE,
    maxTotalSize = DEFAULT_MAX_TOTAL_SIZE,
    strip = 0,
  } = options

  // Normalize output directory path for cross-platform compatibility
  const normalizedOutputDir = normalizePath(outputDir)
  await safeMkdir(normalizedOutputDir)

  const zip = new AdmZip(archivePath)
  const path = getPath()

  // Pre-validate all entries for security
  const entries = zip.getEntries()
  let totalExtractedSize = 0

  for (const entry of entries) {
    if (entry.isDirectory) {
      continue
    }

    // Check individual file size
    const uncompressedSize = entry.header.size
    if (uncompressedSize > maxFileSize) {
      throw new Error(
        `File size exceeds limit: ${entry.entryName} (${uncompressedSize} bytes > ${maxFileSize} bytes)`,
      )
    }

    // Check total extracted size
    totalExtractedSize += uncompressedSize
    if (totalExtractedSize > maxTotalSize) {
      throw new Error(
        `Total extracted size exceeds limit: ${totalExtractedSize} bytes > ${maxTotalSize} bytes`,
      )
    }

    // ZIP entries always use forward slashes per ZIP specification
    const parts = entry.entryName.split('/')
    if (parts.length <= strip) {
      continue
    }

    const strippedPath = parts.slice(strip).join('/')
    const targetPath = path.join(normalizedOutputDir, strippedPath)

    // Validate path is within target directory (prevents path traversal)
    validatePathWithinBase(targetPath, normalizedOutputDir, entry.entryName)
  }

  if (strip === 0) {
    // Simple case: extract everything as-is
    // Even without strip, validate paths
    for (const entry of entries) {
      if (!entry.isDirectory) {
        const targetPath = path.join(normalizedOutputDir, entry.entryName)
        validatePathWithinBase(targetPath, normalizedOutputDir, entry.entryName)
      }
    }

    zip.extractAllTo(normalizedOutputDir, true)
  } else {
    // Strip leading path components
    const path = getPath()
    const entries = zip.getEntries()

    // Collect all directories we need to create
    const dirsToCreate = new Set<string>()
    for (const entry of entries) {
      if (entry.isDirectory) {
        continue
      }

      // ZIP entries always use forward slashes per ZIP specification
      const parts = entry.entryName.split('/')
      if (parts.length <= strip) {
        continue
      }

      const strippedPath = parts.slice(strip).join('/')
      const targetPath = path.join(normalizedOutputDir, strippedPath)
      dirsToCreate.add(path.dirname(targetPath))
    }

    // Create all directories
    await Promise.all(Array.from(dirsToCreate).map(dir => safeMkdir(dir)))

    // Extract all files (synchronous operation)
    for (const entry of entries) {
      if (entry.isDirectory) {
        continue
      }

      // ZIP entries always use forward slashes per ZIP specification
      const parts = entry.entryName.split('/')
      if (parts.length <= strip) {
        continue
      }

      const strippedPath = parts.slice(strip).join('/')
      const targetPath = path.join(normalizedOutputDir, strippedPath)

      // Extract file
      zip.extractEntryTo(entry, path.dirname(targetPath), false, true)
    }
  }
}

/**
 * Extract an archive to a directory.
 * Automatically detects format from file extension.
 *
 * @param archivePath - Path to archive file
 * @param outputDir - Directory to extract to
 * @param options - Extraction options
 * @throws Error if archive format is not supported
 */
export async function extractArchive(
  archivePath: string,
  outputDir: string,
  options: ExtractOptions = {},
): Promise<void> {
  const format = detectArchiveFormat(archivePath)

  if (!format) {
    const path = getPath()
    const ext = path.extname(archivePath).toLowerCase()
    throw new Error(
      `Unsupported archive format${ext ? ` (extension: ${ext})` : ''}: ${archivePath}. ` +
        'Supported formats: .zip, .tar, .tar.gz, .tgz',
    )
  }

  switch (format) {
    case 'zip':
      return await extractZip(archivePath, outputDir, options)
    case 'tar':
      return await extractTar(archivePath, outputDir, options)
    case 'tar.gz':
    case 'tgz':
      return await extractTarGz(archivePath, outputDir, options)
  }
}
