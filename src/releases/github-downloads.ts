/**
 * @fileoverview GitHub release asset downloads.
 */

import process from 'node:process'

import { safeMkdir } from '../fs'
import { httpDownload } from '../http-request'
import { getDefaultLogger } from '../logger'
import {
  ErrorCtor,
  StringPrototypeEndsWith,
  StringPrototypeStartsWith,
} from '../primordials'
import { spawn } from '../spawn'

import { getLatestRelease, getReleaseAssetUrl } from './github-api'

import type {
  AssetPattern,
  DownloadGitHubReleaseConfig,
  RepoConfig,
} from './github-types'

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
    const latestTag = await getLatestRelease(toolPrefix, { owner, repo })
    if (!latestTag) {
      throw new ErrorCtor(`No ${toolPrefix} release found in ${owner}/${repo}`)
    }
    tag = latestTag
  } else {
    throw new ErrorCtor('Either toolPrefix or tag must be provided')
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
  const isWindows = StringPrototypeEndsWith(binaryName, '.exe')
  if (!isWindows) {
    fs.chmodSync(binaryPath, 0o755)

    // Remove macOS quarantine attribute if present (only on macOS host for macOS target).
    if (
      removeMacOSQuarantine &&
      process.platform === 'darwin' &&
      StringPrototypeStartsWith(platformArch, 'darwin')
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
  const downloadUrl = await getReleaseAssetUrl(tag, assetPattern, {
    owner,
    repo,
  })

  if (!downloadUrl) {
    const patternDesc =
      typeof assetPattern === 'string' ? assetPattern : 'matching pattern'
    throw new ErrorCtor(`Asset ${patternDesc} not found in release ${tag}`)
  }

  const path = getPath()
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
