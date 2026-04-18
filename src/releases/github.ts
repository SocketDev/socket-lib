/**
 * @fileoverview GitHub release download utilities.
 */

import process from 'node:process'

import picomatch from '../external/picomatch.js'

import {
  type ArchiveFormat,
  detectArchiveFormat,
  extractArchive,
} from '../archives.js'
import { safeMkdir } from '../fs.js'
import { httpDownload, httpRequest } from '../http-request.js'
import { getDefaultLogger } from '../logger.js'
import { pRetry } from '../promises.js'
import { spawn } from '../spawn.js'

/**
 * Pattern for matching release assets.
 * Can be either:
 * - A string with glob pattern syntax
 * - A prefix/suffix pair for explicit matching (backward compatible)
 * - A RegExp for complex patterns
 *
 * String patterns support full glob syntax via picomatch.
 * Examples:
 * - Simple wildcard: yoga-sync-*.mjs matches yoga-sync-abc123.mjs
 * - Complex: models-*.tar.gz matches models-2024-01-15.tar.gz
 * - Prefix wildcard: *-models.tar.gz matches foo-models.tar.gz
 * - Suffix wildcard: yoga-* matches yoga-layout
 * - Brace expansion: {yoga,models}-*.{mjs,js} matches yoga-abc.mjs or models-xyz.js
 *
 * For backward compatibility, prefix/suffix objects are still supported but glob patterns are recommended.
 */
export type AssetPattern = string | { prefix: string; suffix: string } | RegExp

/**
 * Configuration for downloading a GitHub release.
 */
export interface DownloadGitHubReleaseConfig {
  /** Asset name on GitHub. */
  assetName: string
  /** Binary filename (e.g., 'node', 'binject'). */
  binaryName: string
  /** Working directory (defaults to process.cwd()). */
  cwd?: string
  /** Download destination directory. @default 'build/downloaded' */
  downloadDir?: string
  /** GitHub repository owner/organization. */
  owner: string
  /** Platform-arch identifier (e.g., 'linux-x64-musl'). */
  platformArch: string
  /** Suppress log messages. @default false */
  quiet?: boolean
  /** Remove macOS quarantine attribute after download. @default true */
  removeMacOSQuarantine?: boolean
  /** GitHub repository name. */
  repo: string
  /** Specific release tag to download. */
  tag?: string
  /** Tool name for directory structure. */
  toolName: string
  /** Tool prefix for finding latest release. */
  toolPrefix?: string
}

/**
 * Configuration for repository access.
 */
export interface RepoConfig {
  /**
   * GitHub repository owner/organization.
   */
  owner: string
  /**
   * GitHub repository name.
   */
  repo: string
}

/**
 * Retry configuration for GitHub API requests.
 * Uses exponential backoff to handle transient failures and rate limiting.
 */
const RETRY_CONFIG = Object.freeze({
  __proto__: null,
  // Exponential backoff: delay doubles with each retry (5s, 10s, 20s).
  backoffFactor: 2,
  // Initial delay before first retry.
  baseDelayMs: 5000,
  // Maximum number of retry attempts (excluding initial request).
  retries: 2,
})

const logger = getDefaultLogger()

let _fs: typeof import('node:fs') | undefined
let _path: typeof import('node:path') | undefined

/**
 * Lazily load the fs module to avoid Webpack errors.
 * Uses non-'node:' prefixed require to prevent Webpack bundling issues.
 *
 * @private
 */
/*@__NO_SIDE_EFFECTS__*/
function getFs() {
  if (_fs === undefined) {
    // Use non-'node:' prefixed require to avoid Webpack errors.

    _fs = /*@__PURE__*/ require('node:fs')
  }
  return _fs as typeof import('node:fs')
}

/**
 * Lazily load the path module to avoid Webpack errors.
 * Uses non-'node:' prefixed require to prevent Webpack bundling issues.
 *
 * @returns The Node.js path module
 * @private
 */
/*@__NO_SIDE_EFFECTS__*/
function getPath() {
  if (_path === undefined) {
    // Use non-'node:' prefixed require to avoid Webpack errors.

    _path = /*@__PURE__*/ require('node:path')
  }
  return _path as typeof import('node:path')
}

/**
 * Create a matcher function for a pattern using picomatch for glob patterns
 * or simple prefix/suffix matching for object patterns.
 *
 * @param pattern - Pattern to match (string glob, prefix/suffix object, or RegExp)
 * @returns Function that tests if a string matches the pattern
 *
 * @example
 * ```typescript
 * const isMatch = createAssetMatcher('tool-*-linux-x64')
 * isMatch('tool-v1.0-linux-x64')  // true
 * isMatch('tool-v1.0-darwin-arm64')  // false
 * ```
 */
export function createAssetMatcher(
  pattern: string | { prefix: string; suffix: string } | RegExp,
): (input: string) => boolean {
  if (typeof pattern === 'string') {
    // Use picomatch for glob pattern matching.
    const isMatch = picomatch(pattern)
    return (input: string) => isMatch(input)
  }

  if (pattern instanceof RegExp) {
    return (input: string) => pattern.test(input)
  }

  // Prefix/suffix object pattern (backward compatible).
  const { prefix, suffix } = pattern
  return (input: string) => input.startsWith(prefix) && input.endsWith(suffix)
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

  // Create output directory
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
    throw new Error(`Failed to extract archive: ${archivePath}`, { cause })
  } finally {
    // Cleanup temporary archive file if requested
    if (cleanup) {
      try {
        await fs.promises.unlink(archivePath)
        if (!quiet) {
          logger.info('Cleaned up temporary archive file')
        }
      } catch (error) {
        // Ignore cleanup errors
        if (!quiet) {
          logger.warn(`Failed to cleanup archive file: ${error}`)
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

  // Create output directory
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
    throw new Error(`Failed to extract zip file: ${zipPath}`, { cause })
  } finally {
    // Cleanup temporary zip file if requested
    if (cleanup) {
      try {
        await fs.promises.unlink(zipPath)
        if (!quiet) {
          logger.info('Cleaned up temporary zip file')
        }
      } catch (error) {
        // Ignore cleanup errors
        if (!quiet) {
          logger.warn(`Failed to cleanup zip file: ${error}`)
        }
      }
    }
  }

  return outputDir
}

/**
 * Download a binary from any GitHub repository with version caching.
 *
 * @param config - Download configuration
 * @returns Path to the downloaded binary
 *
 * @example
 * ```typescript
 * const binaryPath = await downloadGitHubRelease({
 *   owner: 'SocketDev', repo: 'socket-btm',
 *   toolName: 'lief', toolPrefix: 'lief-',
 *   assetName: 'lief-linux-x64', binaryName: 'lief',
 *   platformArch: 'linux-x64',
 * })
 * ```
 */
export async function downloadGitHubRelease(
  config: DownloadGitHubReleaseConfig,
): Promise<string> {
  const {
    assetName,
    binaryName,
    cwd = process.cwd(),
    downloadDir = 'build/downloaded',
    owner,
    platformArch,
    quiet = false,
    removeMacOSQuarantine = true,
    repo,
    tag: explicitTag,
    toolName,
    toolPrefix,
  } = config

  // Get release tag (either explicit or latest).
  let tag: string
  if (explicitTag) {
    tag = explicitTag
  } else if (toolPrefix) {
    const latestTag = await getLatestRelease(
      toolPrefix,
      { owner, repo },
      { quiet },
    )
    if (!latestTag) {
      throw new Error(`No ${toolPrefix} release found in ${owner}/${repo}`)
    }
    tag = latestTag
  } else {
    throw new Error('Either toolPrefix or tag must be provided')
  }

  const path = getPath()
  // Resolve download directory (can be absolute or relative to cwd).
  const resolvedDownloadDir = path.isAbsolute(downloadDir)
    ? downloadDir
    : path.join(cwd, downloadDir)

  // Caller controls full directory structure (no automatic nesting).
  const binaryDir = resolvedDownloadDir
  const binaryPath = path.join(binaryDir, binaryName)
  const versionPath = path.join(binaryDir, '.version')

  // Check if already downloaded.
  const fs = getFs()
  if (fs.existsSync(versionPath) && fs.existsSync(binaryPath)) {
    const cachedVersion = (
      await fs.promises.readFile(versionPath, 'utf8')
    ).trim()
    // Re-check binary exists after reading version (prevent TOCTOU race)
    if (cachedVersion === tag && fs.existsSync(binaryPath)) {
      if (!quiet) {
        logger.info(`Using cached ${toolName} (${platformArch}): ${binaryPath}`)
      }
      return binaryPath
    }
  }

  // Download the asset.
  if (!quiet) {
    logger.info(`Downloading ${toolName} for ${platformArch}...`)
  }
  await downloadReleaseAsset(
    tag,
    assetName,
    binaryPath,
    { owner, repo },
    { quiet },
  )

  // Make executable on Unix-like systems.
  const isWindows = binaryName.endsWith('.exe')
  if (!isWindows) {
    fs.chmodSync(binaryPath, 0o755)

    // Remove macOS quarantine attribute if present (only on macOS host for macOS target).
    if (
      removeMacOSQuarantine &&
      process.platform === 'darwin' &&
      platformArch.startsWith('darwin')
    ) {
      try {
        await spawn('xattr', ['-d', 'com.apple.quarantine', binaryPath], {
          stdio: 'ignore',
        })
      } catch {
        // Ignore errors - attribute might not exist or xattr might not be available.
      }
    }
  }

  // Write version file.
  await fs.promises.writeFile(versionPath, tag, 'utf8')

  if (!quiet) {
    logger.info(`Downloaded ${toolName} to ${binaryPath}`)
  }

  return binaryPath
}

/**
 * Download a specific release asset.
 * Supports pattern matching for dynamic asset discovery.
 *
 * @param tag - Release tag name
 * @param assetPattern - Asset name or pattern (glob string, prefix/suffix object, or RegExp)
 * @param outputPath - Path to write the downloaded file
 * @param repoConfig - Repository configuration (owner/repo)
 * @param options - Additional options
 *
 * @example
 * ```typescript
 * await downloadReleaseAsset(
 *   'v1.0.0', 'tool-linux-x64', '/tmp/tool',
 *   { owner: 'SocketDev', repo: 'socket-btm' },
 * )
 * ```
 */
export async function downloadReleaseAsset(
  tag: string,
  assetPattern: string | AssetPattern,
  outputPath: string,
  repoConfig: RepoConfig,
  options: { quiet?: boolean } = {},
): Promise<void> {
  const { owner, repo } = repoConfig
  const { quiet = false } = options

  // Get the browser_download_url for the asset.
  const downloadUrl = await getReleaseAssetUrl(
    tag,
    assetPattern,
    { owner, repo },
    { quiet },
  )

  if (!downloadUrl) {
    const patternDesc =
      typeof assetPattern === 'string' ? assetPattern : 'matching pattern'
    throw new Error(`Asset ${patternDesc} not found in release ${tag}`)
  }

  const path = getPath()
  // Create output directory.
  await safeMkdir(path.dirname(outputPath))

  // Download using httpDownload which supports redirects and retries.
  // httpDownload deletes existing files before downloading to prevent partial/corrupted issues.
  await httpDownload(downloadUrl, outputPath, {
    logger: quiet ? undefined : logger,
    progressInterval: 10,
    retries: 2,
    retryDelay: 5000,
  })
}

/**
 * Get GitHub authentication headers if token is available.
 * Checks GH_TOKEN or GITHUB_TOKEN environment variables.
 *
 * @returns Headers object with Authorization header if token exists.
 *
 * @example
 * ```typescript
 * const headers = getAuthHeaders()
 * // { Accept: 'application/vnd.github+json', Authorization: 'Bearer ...' }
 * ```
 */
export function getAuthHeaders(): Record<string, string> {
  const token = process.env['GH_TOKEN'] || process.env['GITHUB_TOKEN']
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

/**
 * Get latest release tag matching a tool prefix.
 * Optionally filter by releases containing a matching asset.
 *
 * @param toolPrefix - Tool name prefix to search for (e.g., 'node-smol-')
 * @param repoConfig - Repository configuration (owner/repo)
 * @param options - Additional options
 * @param options.assetPattern - Optional pattern to filter releases by matching asset
 * @returns Latest release tag or null if not found
 *
 * @example
 * ```typescript
 * const tag = await getLatestRelease('lief-', {
 *   owner: 'SocketDev', repo: 'socket-btm',
 * })
 * console.log(tag) // 'lief-2025-01-15-abc1234'
 * ```
 */
export async function getLatestRelease(
  toolPrefix: string,
  repoConfig: RepoConfig,
  options: { assetPattern?: AssetPattern; quiet?: boolean } = {},
): Promise<string | null> {
  const { assetPattern, quiet = false } = options
  const { owner, repo } = repoConfig

  // Create matcher function if pattern provided.
  const isMatch = assetPattern ? createAssetMatcher(assetPattern) : undefined

  return (
    (await pRetry(
      async () => {
        // Fetch recent releases (100 should cover all tool releases).
        const response = await httpRequest(
          `https://api.github.com/repos/${owner}/${repo}/releases?per_page=100`,
          {
            headers: getAuthHeaders(),
          },
        )

        if (!response.ok) {
          throw new Error(`Failed to fetch releases: ${response.status}`)
        }

        let releases: Array<{
          tag_name: string
          published_at: string
          assets: Array<{ name: string }>
        }>
        try {
          releases = JSON.parse(response.body.toString('utf8'))
        } catch (cause) {
          throw new Error(
            `Failed to parse GitHub releases response from https://api.github.com/repos/${owner}/${repo}/releases`,
            { cause },
          )
        }

        // Filter releases matching the tool prefix.
        const matchingReleases = releases.filter(release => {
          const { assets, tag_name: tag } = release
          if (!tag.startsWith(toolPrefix)) {
            return false
          }

          // Skip releases with no assets (empty releases).
          if (!assets || assets.length === 0) {
            return false
          }

          // If asset pattern provided, check if release has matching asset.
          if (isMatch) {
            const hasMatchingAsset = assets.some((a: { name: string }) =>
              isMatch(a.name),
            )
            if (!hasMatchingAsset) {
              return false
            }
          }

          return true
        })

        if (matchingReleases.length === 0) {
          // No matching release found.
          if (!quiet) {
            logger.info(`No ${toolPrefix} release found in latest 100 releases`)
          }
          return null
        }

        // Sort by published_at descending (newest first).
        // GitHub API doesn't guarantee order, so we must sort explicitly.
        matchingReleases.sort(
          (a: { published_at: string }, b: { published_at: string }) =>
            new Date(b.published_at).getTime() -
            new Date(a.published_at).getTime(),
        )

        const latestRelease = matchingReleases[0]!
        const tag = latestRelease.tag_name

        if (!quiet) {
          logger.info(`Found release: ${tag}`)
        }
        return tag
      },
      {
        ...RETRY_CONFIG,
        onRetry: (attempt, error) => {
          if (!quiet) {
            logger.info(
              `Retry attempt ${attempt + 1}/${RETRY_CONFIG.retries + 1} for ${toolPrefix} release...`,
            )
            logger.warn(
              `Attempt ${attempt + 1}/${RETRY_CONFIG.retries + 1} failed: ${error instanceof Error ? error.message : String(error)}`,
            )
          }
          return undefined
        },
      },
    )) ?? null
  )
}

/**
 * Get download URL for a specific release asset.
 * Supports pattern matching for dynamic asset discovery.
 *
 * @param tag - Release tag name
 * @param assetPattern - Asset name or pattern (glob string, prefix/suffix object, or RegExp)
 * @param repoConfig - Repository configuration (owner/repo)
 * @param options - Additional options
 * @returns Browser download URL for the asset
 *
 * @example
 * ```typescript
 * const url = await getReleaseAssetUrl(
 *   'v1.0.0', 'tool-linux-x64',
 *   { owner: 'SocketDev', repo: 'socket-btm' },
 * )
 * ```
 */
export async function getReleaseAssetUrl(
  tag: string,
  assetPattern: string | AssetPattern,
  repoConfig: RepoConfig,
  options: { quiet?: boolean } = {},
): Promise<string | null> {
  const { owner, repo } = repoConfig
  const { quiet = false } = options

  // Create matcher function for the pattern.
  const isMatch =
    typeof assetPattern === 'string' &&
    !assetPattern.includes('*') &&
    !assetPattern.includes('{')
      ? (input: string) => input === assetPattern
      : createAssetMatcher(assetPattern as AssetPattern)

  return (
    (await pRetry(
      async () => {
        const response = await httpRequest(
          `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`,
          {
            headers: getAuthHeaders(),
          },
        )

        if (!response.ok) {
          throw new Error(`Failed to fetch release ${tag}: ${response.status}`)
        }

        let release: {
          assets: Array<{ name: string; browser_download_url: string }>
        }
        try {
          release = JSON.parse(response.body.toString('utf8'))
        } catch (cause) {
          throw new Error(
            `Failed to parse GitHub release response for tag ${tag}`,
            { cause },
          )
        }

        // Find the matching asset.
        const assets = release.assets
        if (!Array.isArray(assets)) {
          throw new Error(`Release ${tag} has no assets`)
        }
        const asset = assets.find(a => isMatch(a.name))

        if (!asset) {
          const patternDesc =
            typeof assetPattern === 'string' ? assetPattern : 'matching pattern'
          throw new Error(`Asset ${patternDesc} not found in release ${tag}`)
        }

        if (!quiet) {
          logger.info(`Found asset: ${asset.name}`)
        }

        return asset.browser_download_url
      },
      {
        ...RETRY_CONFIG,
        onRetry: (attempt, error) => {
          if (!quiet) {
            logger.info(
              `Retry attempt ${attempt + 1}/${RETRY_CONFIG.retries + 1} for asset URL...`,
            )
            logger.warn(
              `Attempt ${attempt + 1}/${RETRY_CONFIG.retries + 1} failed: ${error instanceof Error ? error.message : String(error)}`,
            )
          }
          return undefined
        },
      },
    )) ?? null
  )
}
