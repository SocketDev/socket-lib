/**
 * @fileoverview Socket-btm release download utilities.
 */

import {
  type Arch,
  getArch,
  type Libc,
  getPlatform,
  type Platform,
} from '../constants/platform.js'
import {
  type AssetPattern,
  downloadGitHubRelease,
  type DownloadGitHubReleaseConfig,
  getLatestRelease,
  getReleaseAssetUrl,
  SOCKET_BTM_REPO,
} from './github.js'

export type { Arch, Libc, Platform }

/**
 * Map Node.js arch to socket-btm asset arch naming.
 */
const ARCH_MAP: Record<string, string> = {
  __proto__: null,
  arm64: 'arm64',
  x64: 'x64',
}

let _fs: typeof import('node:fs') | undefined

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

    _fs = /*@__PURE__*/ require('fs')
  }
  return _fs as typeof import('node:fs')
}

/**
 * Configuration for downloading socket-btm generic assets.
 */
export interface SocketBtmAssetConfig {
  /** Asset name or pattern on GitHub. */
  asset: string | AssetPattern
  /** @internal Discriminator fields */
  bin?: never
  /** Working directory (defaults to process.cwd()). */
  cwd?: string
  /** Download destination directory. @default 'build/downloaded' */
  downloadDir?: string
  /** @internal Discriminator fields */
  libc?: never
  /** Output filename. @default resolved asset name */
  output?: string
  /** Suppress log messages. @default false */
  quiet?: boolean
  /** Remove macOS quarantine attribute after download. @default false */
  removeMacOSQuarantine?: boolean
  /** Specific release tag to download. */
  tag?: string
  /** @internal Discriminator fields */
  targetArch?: never
  /** @internal Discriminator fields */
  targetPlatform?: never
  /** Tool/package name for directory structure and release matching. */
  tool: string
}

/**
 * Configuration for downloading socket-btm binary releases.
 */
export interface SocketBtmBinaryConfig {
  /** @internal Discriminator field */
  asset?: never
  /** Binary/executable name (without extension). @default tool */
  bin?: string
  /** Working directory (defaults to process.cwd()). */
  cwd?: string
  /** Download destination directory. @default 'build/downloaded' */
  downloadDir?: string
  /** Linux libc variant. Auto-detected if not specified. */
  libc?: Libc
  /** Suppress log messages. @default false */
  quiet?: boolean
  /** Remove macOS quarantine attribute after download. @default true */
  removeMacOSQuarantine?: boolean
  /** Specific release tag to download. */
  tag?: string
  /** Target architecture (defaults to current arch). */
  targetArch?: Arch
  /** Target platform (defaults to current platform). */
  targetPlatform?: Platform
  /** Tool/package name for directory structure and release matching. */
  tool: string
}

/**
 * Configuration for downloading socket-btm releases (binary or asset).
 */
export type SocketBtmReleaseConfig =
  | SocketBtmBinaryConfig
  | SocketBtmAssetConfig

/**
 * Detect the libc variant (musl or glibc) on Linux systems.
 * Returns undefined for non-Linux platforms.
 *
 * @returns 'musl', 'glibc', or undefined (for non-Linux)
 */
export function detectLibc(): Libc | undefined {
  if (getPlatform() !== 'linux') {
    return undefined
  }

  try {
    const fs = getFs()
    // Check for musl-specific dynamic linker.
    // These files only exist on musl systems.
    const muslPaths = [
      '/lib/ld-musl-x86_64.so.1',
      '/lib/ld-musl-aarch64.so.1',
      '/usr/lib/ld-musl-x86_64.so.1',
      '/usr/lib/ld-musl-aarch64.so.1',
    ]

    for (const path of muslPaths) {
      if (fs.existsSync(path)) {
        return 'musl'
      }
    }

    // If no musl files found, assume glibc.
    return 'glibc'
  } catch {
    // If detection fails, default to glibc (most common).
    return 'glibc'
  }
}

/**
 * Download a release from socket-btm.
 *
 * @param config - Download configuration
 * @returns Path to the downloaded file
 */
export async function downloadSocketBtmRelease(
  config: SocketBtmReleaseConfig,
): Promise<string> {
  const { cwd, downloadDir, quiet = false, tag, tool } = config

  // Auto-generate toolPrefix from tool name (follows socket-btm tag pattern: {tool}-{date}-{commit})
  const toolPrefix = `${tool}-`

  let downloadConfig: DownloadGitHubReleaseConfig

  // Infer type from presence of 'asset' field
  if ('asset' in config) {
    // Asset download
    const {
      asset,
      output,
      removeMacOSQuarantine = false,
    } = config as SocketBtmAssetConfig

    // Resolve asset pattern to actual asset name if needed.
    let resolvedAsset: string
    let resolvedTag = tag

    // Check if asset is a string without wildcard (exact match).
    const isExactMatch = typeof asset === 'string' && !asset.includes('*')

    if (isExactMatch) {
      // Exact asset name provided.
      resolvedAsset = asset as string
    } else {
      // Pattern provided (wildcard string, object, or RegExp) - need to find matching asset.
      if (tag) {
        throw new Error(
          'Cannot use asset pattern with explicit tag. Either provide exact asset name or omit tag.',
        )
      }

      // Find latest release with matching asset.
      resolvedTag = await getLatestRelease(toolPrefix, SOCKET_BTM_REPO, {
        assetPattern: asset,
        quiet,
      })

      if (!resolvedTag) {
        throw new Error(`No ${tool} release with matching asset pattern found`)
      }

      // Get the matching asset URL (which will give us the asset name).
      const assetUrl = await getReleaseAssetUrl(
        resolvedTag,
        asset,
        SOCKET_BTM_REPO,
        {
          quiet,
        },
      )

      if (!assetUrl) {
        throw new Error(`No matching asset found in release ${resolvedTag}`)
      }

      // Extract asset name from URL.
      resolvedAsset = assetUrl.split('/').pop() || asset.toString()
    }

    // Default output to resolved asset name if not provided
    const outputName = output || resolvedAsset

    // For non-binary assets, use a simple 'assets' directory instead of platform-arch
    const platformArch = 'assets'

    downloadConfig = {
      owner: SOCKET_BTM_REPO.owner,
      repo: SOCKET_BTM_REPO.repo,
      cwd,
      downloadDir,
      toolName: tool,
      platformArch,
      binaryName: outputName,
      assetName: resolvedAsset,
      toolPrefix,
      tag: resolvedTag,
      quiet,
      removeMacOSQuarantine,
    }
  } else {
    // Binary download
    const {
      bin,
      libc = detectLibc(),
      removeMacOSQuarantine = true,
      targetArch = getArch(),
      targetPlatform = getPlatform(),
    } = config as SocketBtmBinaryConfig

    // Default bin to tool if not provided (like brew/cargo)
    const baseName = bin || tool

    // Build asset name and platform-arch identifier
    const assetName = getBinaryAssetName(
      baseName,
      targetPlatform,
      targetArch,
      libc,
    )
    const platformArch = getPlatformArch(targetPlatform, targetArch, libc)
    const binaryName = getBinaryName(baseName, targetPlatform)

    downloadConfig = {
      owner: SOCKET_BTM_REPO.owner,
      repo: SOCKET_BTM_REPO.repo,
      cwd,
      downloadDir,
      toolName: tool,
      platformArch,
      binaryName,
      assetName,
      toolPrefix,
      tag,
      quiet,
      removeMacOSQuarantine,
    }
  }

  return await downloadGitHubRelease(downloadConfig)
}

/**
 * Get asset name for a socket-btm binary.
 *
 * @param binaryBaseName - Binary basename (e.g., 'binject', 'node')
 * @param platform - Target platform
 * @param arch - Target architecture
 * @param libc - Linux libc variant (optional)
 * @returns Asset name (e.g., 'binject-darwin-arm64', 'node-linux-x64-musl')
 */
export function getBinaryAssetName(
  binaryBaseName: string,
  platform: Platform,
  arch: Arch,
  libc?: Libc | undefined,
): string {
  const mappedArch = ARCH_MAP[arch]
  if (!mappedArch) {
    throw new Error(`Unsupported architecture: ${arch}`)
  }

  const muslSuffix = platform === 'linux' && libc === 'musl' ? '-musl' : ''
  const ext = platform === 'win32' ? '.exe' : ''

  if (platform === 'darwin') {
    return `${binaryBaseName}-darwin-${mappedArch}${ext}`
  }
  if (platform === 'linux') {
    return `${binaryBaseName}-linux-${mappedArch}${muslSuffix}${ext}`
  }
  if (platform === 'win32') {
    return `${binaryBaseName}-win-${mappedArch}${ext}`
  }

  throw new Error(`Unsupported platform: ${platform}`)
}

/**
 * Get binary filename for output.
 *
 * @param binaryBaseName - Binary basename (e.g., 'node', 'binject')
 * @param platform - Target platform
 * @returns Binary filename (e.g., 'node', 'node.exe')
 */
export function getBinaryName(
  binaryBaseName: string,
  platform: Platform,
): string {
  return platform === 'win32' ? `${binaryBaseName}.exe` : binaryBaseName
}

/**
 * Get platform-arch identifier for directory structure.
 *
 * @param platform - Target platform
 * @param arch - Target architecture
 * @param libc - Linux libc variant (optional)
 * @returns Platform-arch identifier (e.g., 'darwin-arm64', 'linux-x64-musl')
 */
export function getPlatformArch(
  platform: Platform,
  arch: Arch,
  libc?: Libc | undefined,
): string {
  const mappedArch = ARCH_MAP[arch]
  if (!mappedArch) {
    throw new Error(`Unsupported architecture: ${arch}`)
  }

  const muslSuffix = platform === 'linux' && libc === 'musl' ? '-musl' : ''
  return `${platform}-${mappedArch}${muslSuffix}`
}
