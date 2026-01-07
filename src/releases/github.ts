/**
 * @fileoverview GitHub release download utilities.
 */

import { chmodSync, existsSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'

import picomatch from '../external/picomatch.js'

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
 * Result of finding a release asset.
 */
export interface FindReleaseAssetResult {
  /** The release tag name. */
  tag: string
  /** The matching asset name. */
  assetName: string
}

/**
 * Create a matcher function for a pattern using picomatch for glob patterns
 * or simple prefix/suffix matching for object patterns.
 *
 * @param pattern - Pattern to match (string glob, prefix/suffix object, or RegExp)
 * @returns Function that tests if a string matches the pattern
 *
 * @example
 * ```ts
 * const matcher = createMatcher('yoga-sync-*.mjs')
 * matcher('yoga-sync-abc123.mjs') // true
 * matcher('models-xyz.tar.gz') // false
 *
 * const matcher2 = createMatcher({ prefix: 'yoga-', suffix: '.mjs' })
 * matcher2('yoga-sync.mjs') // true
 * matcher2('yoga-layout.js') // false
 * ```
 */
function createMatcher(
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
 * Find a release asset matching a pattern in the latest release.
 * Searches for the first release matching the tool prefix,
 * then finds the first asset matching the provided pattern.
 *
 * @param toolPrefix - Tool name prefix to search for (e.g., 'yoga-layout-')
 * @param assetPattern - Pattern to match asset names (glob string, prefix/suffix object, or RegExp)
 * @param repoConfig - Repository configuration (owner/repo)
 * @param options - Additional options
 * @returns Result with tag and asset name, or null if not found
 *
 * @example
 * ```ts
 * // Find yoga-sync asset with glob pattern
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
 * // Find models tar.gz with glob pattern
 * const result = await findReleaseAsset(
 *   'models-',
 *   'models-*.tar.gz',
 *   { owner: 'SocketDev', repo: 'socket-btm' }
 * )
 * ```
 *
 * @example
 * ```ts
 * // Find asset with glob braces pattern
 * const result = await findReleaseAsset(
 *   'yoga-layout-',
 *   'yoga-{sync,layout}-*.{mjs,js}',
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

  // Create matcher function for the pattern.
  const isMatch = createMatcher(assetPattern)

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

        // Find matching asset in this release using the matcher function.
        const matchingAsset = assets.find((a: { name: string }) =>
          isMatch(a.name),
        )

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
