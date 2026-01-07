/**
 * @fileoverview GitHub release download utilities.
 */

import { chmodSync, existsSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'

import { safeMkdir } from '../fs.js'
import { httpDownload, httpRequest } from '../http-request.js'
import { getDefaultLogger } from '../logger.js'
import { pRetry } from '../promises.js'
import { spawn } from '../spawn.js'

const logger = getDefaultLogger()

let _path: typeof import('node:path') | undefined
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

    _path = /*@__PURE__*/ require('path')
  }
  return _path as typeof import('node:path')
}

/**
 * Socket-btm GitHub repository configuration.
 */
export const SOCKET_BTM_REPO = {
  owner: 'SocketDev',
  repo: 'socket-btm',
} as const

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
 * Configuration for downloading a GitHub release.
 */
export interface DownloadGitHubReleaseConfig {
  /** GitHub repository owner/organization. */
  owner: string
  /** GitHub repository name. */
  repo: string
  /** Working directory (defaults to process.cwd()). */
  cwd?: string
  /** Download destination directory. @default 'build/downloaded' */
  downloadDir?: string
  /** Tool name for directory structure. */
  toolName: string
  /** Platform-arch identifier (e.g., 'linux-x64-musl'). */
  platformArch: string
  /** Binary filename (e.g., 'node', 'binject'). */
  binaryName: string
  /** Asset name on GitHub. */
  assetName: string
  /** Tool prefix for finding latest release. */
  toolPrefix?: string
  /** Specific release tag to download. */
  tag?: string
  /** Suppress log messages. @default false */
  quiet?: boolean
  /** Remove macOS quarantine attribute after download. @default true */
  removeMacOSQuarantine?: boolean
}

/**
 * Download a binary from any GitHub repository with version caching.
 *
 * @param config - Download configuration
 * @returns Path to the downloaded binary
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

  // Build download paths following socket-cli pattern.
  const binaryDir = path.join(resolvedDownloadDir, toolName, platformArch)
  const binaryPath = path.join(binaryDir, binaryName)
  const versionPath = path.join(binaryDir, '.version')

  // Check if already downloaded.
  if (existsSync(versionPath) && existsSync(binaryPath)) {
    const cachedVersion = (await readFile(versionPath, 'utf8')).trim()
    if (cachedVersion === tag) {
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
    chmodSync(binaryPath, 0o755)

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
  await writeFile(versionPath, tag, 'utf8')

  if (!quiet) {
    logger.info(`Downloaded ${toolName} to ${binaryPath}`)
  }

  return binaryPath
}

/**
 * Download a specific release asset.
 *
 * @param tag - Release tag name
 * @param assetName - Asset name to download
 * @param outputPath - Path to write the downloaded file
 * @param repoConfig - Repository configuration (owner/repo)
 * @param options - Additional options
 */
export async function downloadReleaseAsset(
  tag: string,
  assetName: string,
  outputPath: string,
  repoConfig: RepoConfig,
  options: { quiet?: boolean } = {},
): Promise<void> {
  const { owner, repo } = repoConfig
  const { quiet = false } = options

  // Get the browser_download_url for the asset.
  const downloadUrl = await getReleaseAssetUrl(
    tag,
    assetName,
    { owner, repo },
    { quiet },
  )

  if (!downloadUrl) {
    throw new Error(`Asset ${assetName} not found in release ${tag}`)
  }

  const path = getPath()
  // Create output directory.
  await safeMkdir(path.dirname(outputPath))

  // Download using httpDownload which supports redirects and retries.
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
 * Pattern for matching release assets.
 * Can be either:
 * - A string with wildcard (*) for simple glob patterns (e.g., 'yoga-sync-*.mjs')
 * - A prefix/suffix pair for explicit matching
 * - A RegExp for complex patterns
 *
 * String patterns support a single wildcard (*) which matches any characters:
 * - 'yoga-sync-*.mjs' → prefix: 'yoga-sync-', suffix: '.mjs'
 * - 'models-*.tar.gz' → prefix: 'models-', suffix: '.tar.gz'
 * - '*-models.tar.gz' → prefix: '', suffix: '-models.tar.gz'
 * - 'yoga-*' → prefix: 'yoga-', suffix: ''
 */
export type AssetPattern = string | { prefix: string; suffix: string } | RegExp

/**
 * Result of finding a release asset.
 */
export interface FindReleaseAssetResult {
  /** The release tag name. */
  tag: string
  /** The matching asset name. */
  assetName: string
}

/**
 * Parse a wildcard pattern string into prefix/suffix components.
 * Supports a single wildcard (*) character.
 *
 * @param pattern - Pattern string with optional wildcard (e.g., 'yoga-sync-*.mjs')
 * @returns Prefix/suffix pair for matching
 * @throws Error if pattern contains multiple wildcards
 *
 * @example
 * ```ts
 * parseWildcardPattern('yoga-sync-*.mjs')
 * // Returns: { prefix: 'yoga-sync-', suffix: '.mjs' }
 *
 * parseWildcardPattern('models-*.tar.gz')
 * // Returns: { prefix: 'models-', suffix: '.tar.gz' }
 *
 * parseWildcardPattern('*-models.tar.gz')
 * // Returns: { prefix: '', suffix: '-models.tar.gz' }
 *
 * parseWildcardPattern('yoga-*')
 * // Returns: { prefix: 'yoga-', suffix: '' }
 *
 * parseWildcardPattern('exact-name.txt')
 * // Returns: { prefix: 'exact-name.txt', suffix: '' } (exact match)
 * ```
 */
function parseWildcardPattern(pattern: string): {
  prefix: string
  suffix: string
} {
  const wildcardIndex = pattern.indexOf('*')

  // No wildcard - treat as exact match (prefix only).
  if (wildcardIndex === -1) {
    return { prefix: pattern, suffix: '' }
  }

  // Check for multiple wildcards.
  const lastWildcardIndex = pattern.lastIndexOf('*')
  if (wildcardIndex !== lastWildcardIndex) {
    throw new Error(
      `Pattern contains multiple wildcards: ${pattern}. Only single wildcard (*) is supported.`,
    )
  }

  // Split at wildcard position.
  const prefix = pattern.slice(0, wildcardIndex)
  const suffix = pattern.slice(wildcardIndex + 1)

  return { prefix, suffix }
}

/**
 * Find a release asset matching a pattern in the latest release.
 * Searches for the first release matching the tool prefix,
 * then finds the first asset matching the provided pattern.
 *
 * @param toolPrefix - Tool name prefix to search for (e.g., 'yoga-layout-')
 * @param assetPattern - Pattern to match asset names (string with wildcard, prefix/suffix object, or RegExp)
 * @param repoConfig - Repository configuration (owner/repo)
 * @param options - Additional options
 * @returns Result with tag and asset name, or null if not found
 *
 * @example
 * ```ts
 * // Find yoga-sync asset with wildcard pattern
 * const result = await findReleaseAsset(
 *   'yoga-layout-',
 *   'yoga-sync-*.mjs',
 *   { owner: 'SocketDev', repo: 'socket-btm' }
 * )
 * // result = { tag: 'yoga-layout-2024-01-15-abc123', assetName: 'yoga-sync-2024-01-15-abc123.mjs' }
 * ```
 *
 * @example
 * ```ts
 * // Find models tar.gz with wildcard pattern
 * const result = await findReleaseAsset(
 *   'models-',
 *   'models-*.tar.gz',
 *   { owner: 'SocketDev', repo: 'socket-btm' }
 * )
 * ```
 *
 * @example
 * ```ts
 * // Find asset with object pattern (backward compatible)
 * const result = await findReleaseAsset(
 *   'yoga-layout-',
 *   { prefix: 'yoga-sync-', suffix: '.mjs' },
 *   { owner: 'SocketDev', repo: 'socket-btm' }
 * )
 * ```
 *
 * @example
 * ```ts
 * // Find models tar.gz with regex
 * const result = await findReleaseAsset(
 *   'models-',
 *   /^models-\d{4}-\d{2}-\d{2}-.+\.tar\.gz$/,
 *   { owner: 'SocketDev', repo: 'socket-btm' }
 * )
 * ```
 */
export async function findReleaseAsset(
  toolPrefix: string,
  assetPattern: AssetPattern,
  repoConfig: RepoConfig,
  options: { quiet?: boolean } = {},
): Promise<FindReleaseAssetResult | null> {
  const { owner, repo } = repoConfig
  const { quiet = false } = options

  // Normalize string patterns to prefix/suffix objects.
  let normalizedPattern: { prefix: string; suffix: string } | RegExp
  if (typeof assetPattern === 'string') {
    normalizedPattern = parseWildcardPattern(assetPattern)
  } else {
    normalizedPattern = assetPattern
  }

  return await pRetry(
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

      const releases = JSON.parse(response.body.toString('utf8'))

      // Find the first release matching the tool prefix.
      for (const release of releases) {
        const { assets, tag_name: tag } = release
        if (!tag.startsWith(toolPrefix)) {
          continue
        }

        // Find matching asset in this release.
        let matchingAsset: { name: string } | undefined

        if (normalizedPattern instanceof RegExp) {
          matchingAsset = assets.find((a: { name: string }) =>
            normalizedPattern.test(a.name),
          )
        } else {
          const { prefix, suffix } = normalizedPattern
          matchingAsset = assets.find(
            (a: { name: string }) =>
              a.name.startsWith(prefix) && a.name.endsWith(suffix),
          )
        }

        if (matchingAsset) {
          if (!quiet) {
            logger.info(`Found release: ${tag}`)
            logger.info(`Found asset: ${matchingAsset.name}`)
          }
          return {
            assetName: matchingAsset.name,
            tag,
          }
        }
      }

      // No matching release or asset found.
      if (!quiet) {
        logger.info(`No ${toolPrefix} release with matching asset found`)
      }
      return null
    },
    {
      ...RETRY_CONFIG,
      onRetry: (attempt, error) => {
        if (!quiet) {
          logger.info(
            `Retry attempt ${attempt + 1}/${RETRY_CONFIG.retries + 1} for release asset search...`,
          )
          logger.warn(
            `Attempt ${attempt + 1}/${RETRY_CONFIG.retries + 1} failed: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
        return undefined
      },
    },
  )
}

/**
 * Get latest release tag matching a tool prefix.
 *
 * @param toolPrefix - Tool name prefix to search for (e.g., 'node-smol-')
 * @param repoConfig - Repository configuration (owner/repo)
 * @param options - Additional options
 * @returns Latest release tag or null if not found
 */
export async function getLatestRelease(
  toolPrefix: string,
  repoConfig: RepoConfig,
  options: { quiet?: boolean } = {},
): Promise<string | null> {
  const { owner, repo } = repoConfig
  const { quiet = false } = options

  return await pRetry(
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

      const releases = JSON.parse(response.body.toString('utf8'))

      // Find the first release matching the tool prefix.
      for (const release of releases) {
        const { tag_name: tag } = release
        if (tag.startsWith(toolPrefix)) {
          if (!quiet) {
            logger.info(`Found release: ${tag}`)
          }
          return tag
        }
      }

      // No matching release found.
      if (!quiet) {
        logger.info(`No ${toolPrefix} release found in latest 100 releases`)
      }
      return null
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
  )
}

/**
 * Get download URL for a specific release asset.
 *
 * @param tag - Release tag name
 * @param assetName - Asset name to download
 * @param repoConfig - Repository configuration (owner/repo)
 * @param options - Additional options
 * @returns Browser download URL for the asset
 */
export async function getReleaseAssetUrl(
  tag: string,
  assetName: string,
  repoConfig: RepoConfig,
  options: { quiet?: boolean } = {},
): Promise<string | null> {
  const { owner, repo } = repoConfig
  const { quiet = false } = options

  return await pRetry(
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

      const release = JSON.parse(response.body.toString('utf8'))

      // Find the matching asset.
      const asset = release.assets.find(
        (a: { name: string }) => a.name === assetName,
      )

      if (!asset) {
        throw new Error(`Asset ${assetName} not found in release ${tag}`)
      }

      if (!quiet) {
        logger.info(`Found asset: ${assetName}`)
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
  )
}
