/**
 * @fileoverview GitHub release archive download + extraction.
 */

import {
  type ArchiveFormat,
  detectArchiveFormat,
  extractArchive,
} from '../archives'
import { safeMkdir } from '../fs'
import { getDefaultLogger } from '../logger'
import { ErrorCtor } from '../primordials'

import { downloadReleaseAsset } from './github-downloads'

import type { AssetPattern, RepoConfig } from './github-types'

const logger = getDefaultLogger()

let _fs: typeof import('node:fs') | undefined
let _path: typeof import('node:path') | undefined

/*@__NO_SIDE_EFFECTS__*/
function getFs() {
  if (_fs === undefined) {
    _fs = /*@__PURE__*/ require('node:fs')
  }
  return _fs as typeof import('node:fs')
}

/*@__NO_SIDE_EFFECTS__*/
function getPath() {
  if (_path === undefined) {
    _path = /*@__PURE__*/ require('node:path')
  }
  return _path as typeof import('node:path')
}

/**
 * Download and extract an archive from a GitHub release.
 * Supports zip, tar, tar.gz, and tgz formats.
 * Automatically handles downloading, extracting, and cleanup.
 *
 * @param tag - Release tag name
 * @param assetPattern - Asset name or pattern (glob string, prefix/suffix object, or RegExp)
 * @param outputDir - Directory to extract the archive contents to
 * @param repoConfig - Repository configuration (owner/repo)
 * @param options - Additional options
 * @param options.quiet - Suppress log messages
 * @param options.cleanup - Remove downloaded archive after extraction (default: true)
 * @param options.strip - Strip leading path components (like tar --strip-components)
 * @param options.format - Archive format (auto-detected if not specified)
 * @returns Path to the extraction directory
 *
 * @example
 * ```typescript
 * const outputDir = await downloadAndExtractArchive(
 *   'v1.0.0', 'data-*.tar.gz', '/tmp/data',
 *   { owner: 'SocketDev', repo: 'socket-btm' },
 * )
 * ```
 */
export async function downloadAndExtractArchive(
  tag: string,
  assetPattern: string | AssetPattern,
  outputDir: string,
  repoConfig: RepoConfig,
  options: {
    cleanup?: boolean
    format?: ArchiveFormat
    quiet?: boolean
    strip?: number
  } = {},
): Promise<string> {
  const { cleanup = true, format, quiet = false, strip } = options

  const path = getPath()
  const fs = getFs()

  await safeMkdir(outputDir)

  // Determine file extension from pattern or format
  let ext = '.archive'
  if (format) {
    ext = format === 'tar.gz' ? '.tar.gz' : `.${format}`
  } else if (typeof assetPattern === 'string') {
    const detectedFormat = detectArchiveFormat(assetPattern)
    if (detectedFormat) {
      ext = detectedFormat === 'tar.gz' ? '.tar.gz' : `.${detectedFormat}`
    }
  }

  // Download archive to temporary location
  const archivePath = path.join(outputDir, `__temp_download__${ext}`)

  if (!quiet) {
    logger.info(`Downloading archive from release ${tag}...`)
  }

  await downloadReleaseAsset(tag, assetPattern, archivePath, repoConfig, {
    quiet,
  })

  if (!quiet) {
    logger.info(`Extracting archive to ${outputDir}...`)
  }

  // Extract archive contents
  try {
    await extractArchive(archivePath, outputDir, { quiet, strip })

    if (!quiet) {
      logger.info(`Extracted archive contents to ${outputDir}`)
    }
  } catch (cause) {
    throw new ErrorCtor(`Failed to extract archive: ${archivePath}`, { cause })
  } finally {
    // Cleanup temporary archive file if requested
    if (cleanup) {
      try {
        await fs.promises.unlink(archivePath)
        if (!quiet) {
          logger.info('Cleaned up temporary archive file')
        }
      } catch (e) {
        // Ignore cleanup errors
        if (!quiet) {
          logger.warn(`Failed to cleanup archive file: ${e}`)
        }
      }
    }
  }

  return outputDir
}

/**
 * Download and extract a zip file from a GitHub release.
 * Automatically handles downloading, extracting, and cleanup.
 *
 * @param tag - Release tag name
 * @param assetPattern - Asset name or pattern (glob string, prefix/suffix object, or RegExp)
 * @param outputDir - Directory to extract the zip contents to
 * @param repoConfig - Repository configuration (owner/repo)
 * @param options - Additional options
 * @param options.quiet - Suppress log messages
 * @param options.cleanup - Remove downloaded zip file after extraction (default: true)
 * @returns Path to the extraction directory
 *
 * @example
 * ```typescript
 * const outputDir = await downloadAndExtractZip(
 *   'v1.0.0', 'models-*.zip', '/tmp/models',
 *   { owner: 'SocketDev', repo: 'socket-btm' },
 * )
 * ```
 */
export async function downloadAndExtractZip(
  tag: string,
  assetPattern: string | AssetPattern,
  outputDir: string,
  repoConfig: RepoConfig,
  options: { cleanup?: boolean; quiet?: boolean } = {},
): Promise<string> {
  const { cleanup = true, quiet = false } = options

  const path = getPath()
  const fs = getFs()

  await safeMkdir(outputDir)

  // Download zip to temporary location
  const zipPath = path.join(outputDir, '__temp_download__.zip')

  if (!quiet) {
    logger.info(`Downloading zip asset from release ${tag}...`)
  }

  await downloadReleaseAsset(tag, assetPattern, zipPath, repoConfig, { quiet })

  if (!quiet) {
    logger.info(`Extracting zip to ${outputDir}...`)
  }

  // Extract zip contents
  try {
    await extractArchive(zipPath, outputDir, { quiet })

    if (!quiet) {
      logger.info(`Extracted zip contents to ${outputDir}`)
    }
  } catch (cause) {
    throw new ErrorCtor(`Failed to extract zip file: ${zipPath}`, { cause })
  } finally {
    // Cleanup temporary zip file if requested
    if (cleanup) {
      try {
        await fs.promises.unlink(zipPath)
        if (!quiet) {
          logger.info('Cleaned up temporary zip file')
        }
      } catch (e) {
        // Ignore cleanup errors
        if (!quiet) {
          logger.warn(`Failed to cleanup zip file: ${e}`)
        }
      }
    }
  }

  return outputDir
}
