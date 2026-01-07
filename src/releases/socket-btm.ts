/**
 * @fileoverview Socket-btm release download utilities.
 *
 * Provides utilities for downloading binaries and assets from the
 * SocketDev/socket-btm GitHub repository. This includes build tools,
 * Node.js binaries, and WASM assets.
 *
 * Features:
 * - Generic function for any socket-btm release asset or binary
 * - Cross-platform binary downloads (can download for target platform/arch)
 * - Automatic platform/arch detection with musl support for Linux
 * - Version caching with .version files
 * - macOS quarantine attribute removal
 * - Configurable working directory and download destination
 *
 * Directory Structure:
 * ```
 * {downloadDir}/{toolName}/{platformArch}/
 * ├── {binaryName}
 * └── .version
 * ```
 */

import { existsSync } from 'fs'
import os from 'os'

import {
  downloadGitHubRelease,
  type DownloadGitHubReleaseConfig,
  SOCKET_BTM_REPO,
} from './github.js'

/**
 * Platform type for socket-btm binaries.
 */
export type Platform = 'darwin' | 'linux' | 'win32'

/**
 * Architecture type for socket-btm binaries.
 */
export type Arch = 'arm64' | 'x64'

/**
 * Linux libc variant.
 */
export type Libc = 'musl' | 'glibc'

/**
 * Configuration for downloading socket-btm binary releases.
 */
export interface SocketBtmBinaryConfig {
  /**
   * Working directory (defaults to process.cwd()).
   */
  cwd?: string
  /**
   * Download destination directory.
   * Can be absolute or relative to cwd.
   * @default 'build/downloaded' (relative to cwd)
   *
   * Inspired by: gh release download --dir
   */
  downloadDir?: string
  /**
   * Tool/package name for directory structure and release matching.
   * Similar to: brew install <formula>, cargo install <crate>
   *
   * Examples: 'node-smol', 'binject', 'binflate'
   *
   * Used for:
   * - Directory path: {downloadDir}/{tool}/{platformArch}/
   * - Finding release: Searches for tags starting with '{tool}-'
   */
  tool: string
  /**
   * Binary/executable name (without extension).
   * Similar to: brew formula→binary mapping (postgresql→psql, imagemagick→magick)
   *
   * Examples: 'node', 'binject', 'psql', 'magick'
   *
   * Used to construct:
   * - Asset pattern: {bin}-{platform}-{arch}[-musl][.exe]
   * - Output filename: {bin} or {bin}.exe
   *
   * Presence of this field indicates binary download (vs asset download).
   *
   * @default tool (e.g., 'binject'→'binject', but 'node-smol'→'node-smol')
   */
  bin?: string
  /**
   * Target platform (defaults to current platform).
   */
  targetPlatform?: Platform
  /**
   * Target architecture (defaults to current arch).
   */
  targetArch?: Arch
  /**
   * Linux libc variant (musl or glibc).
   * Auto-detected from the Node.js binary if not specified.
   * Ignored for non-Linux platforms.
   */
  libc?: Libc
  /**
   * Specific release tag to download.
   * Inspired by: gh release download <tag>
   *
   * If not provided, downloads the latest release matching '{tool}-*' pattern.
   *
   * Examples: 'node-smol-20260105-c47753c', 'binject-20260106-1df5745'
   */
  tag?: string
  /**
   * Suppress log messages.
   * @default false
   */
  quiet?: boolean
  /**
   * Remove macOS quarantine attribute after download.
   * Only applies when downloading on macOS for macOS binaries.
   * @default true
   */
  removeMacOSQuarantine?: boolean

  // Discriminator: presence of 'asset' means this is NOT a binary config
  asset?: never
}

/**
 * Configuration for downloading socket-btm generic assets.
 */
export interface SocketBtmAssetConfig {
  /**
   * Working directory (defaults to process.cwd()).
   */
  cwd?: string
  /**
   * Download destination directory.
   * Can be absolute or relative to cwd.
   * @default 'build/downloaded' (relative to cwd)
   *
   * Inspired by: gh release download --dir
   */
  downloadDir?: string
  /**
   * Tool/package name for directory structure and release matching.
   *
   * Examples: 'yoga-layout', 'onnxruntime', 'models'
   *
   * Used for:
   * - Directory path: {downloadDir}/{tool}/assets/
   * - Finding release: Searches for tags starting with '{tool}-'
   */
  tool: string
  /**
   * Asset name pattern on GitHub.
   * Inspired by: gh release download --pattern
   *
   * Examples: 'yoga-sync.mjs', 'ort-wasm-simd.wasm', '*.onnx'
   *
   * Presence of this field indicates asset download (vs binary download).
   */
  asset: string
  /**
   * Output filename (e.g., 'yoga-sync.mjs').
   * Inspired by: gh release download --output
   *
   * @default asset (uses the asset name as-is)
   */
  output?: string
  /**
   * Specific release tag to download.
   * Inspired by: gh release download <tag>
   *
   * If not provided, downloads the latest release matching '{tool}-*' pattern.
   *
   * Examples: 'yoga-layout-v20260106-a39285c', 'onnxruntime-v20260106-a39285c'
   */
  tag?: string
  /**
   * Suppress log messages.
   * @default false
   */
  quiet?: boolean
  /**
   * Remove macOS quarantine attribute after download.
   * @default false (not needed for non-executable assets)
   */
  removeMacOSQuarantine?: boolean

  // Discriminators: mutually exclusive with binary-specific fields
  bin?: never
  targetPlatform?: never
  targetArch?: never
  libc?: never
}

/**
 * Configuration for downloading socket-btm releases (binary or asset).
 */
export type SocketBtmReleaseConfig =
  | SocketBtmBinaryConfig
  | SocketBtmAssetConfig

/**
 * Map Node.js arch to socket-btm asset arch naming.
 */
const ARCH_MAP: Record<string, string> = {
  arm64: 'arm64',
  x64: 'x64',
}

/**
 * Detect the libc variant (musl or glibc) on Linux systems.
 * Returns undefined for non-Linux platforms.
 *
 * Detection method: Check for musl-specific files in the filesystem.
 * This is more reliable than checking the Node.js binary, especially for
 * statically-linked binaries that may contain references to both libc variants.
 *
 * @returns 'musl', 'glibc', or undefined (for non-Linux)
 */
function detectLibc(): Libc | undefined {
  const platform = os.platform()
  if (platform !== 'linux') {
    return undefined
  }

  try {
    // Check for musl-specific dynamic linker
    // These files only exist on musl systems
    const muslPaths = [
      '/lib/ld-musl-x86_64.so.1',
      '/lib/ld-musl-aarch64.so.1',
      '/usr/lib/ld-musl-x86_64.so.1',
      '/usr/lib/ld-musl-aarch64.so.1',
    ]

    for (const path of muslPaths) {
      if (existsSync(path)) {
        return 'musl'
      }
    }

    // If no musl files found, assume glibc
    return 'glibc'
  } catch {
    // If detection fails, default to glibc (most common)
    return 'glibc'
  }
}

/**
 * Get asset name for a socket-btm binary.
 *
 * Examples:
 * - binject-darwin-arm64
 * - node-linux-x64-musl
 * - binject-win-x64.exe
 *
 * @param binaryBaseName - Binary basename (e.g., 'binject', 'node')
 * @param platform - Target platform
 * @param arch - Target architecture
 * @param libc - Linux libc variant (optional)
 * @returns Asset name
 */
function getBinaryAssetName(
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
 * Get platform-arch identifier for directory structure.
 *
 * Examples:
 * - darwin-arm64
 * - linux-x64-musl
 * - win32-x64
 *
 * @param platform - Target platform
 * @param arch - Target architecture
 * @param libc - Linux libc variant (optional)
 * @returns Platform-arch identifier
 */
function getPlatformArch(platform: Platform, arch: Arch, libc?: Libc): string {
  const mappedArch = ARCH_MAP[arch]
  if (!mappedArch) {
    throw new Error(`Unsupported architecture: ${arch}`)
  }

  const muslSuffix = platform === 'linux' && libc === 'musl' ? '-musl' : ''
  return `${platform}-${mappedArch}${muslSuffix}`
}

/**
 * Get binary filename for output.
 *
 * Examples:
 * - node
 * - node.exe
 * - binject.exe
 *
 * @param binaryBaseName - Binary basename (e.g., 'node', 'binject')
 * @param platform - Target platform
 * @returns Binary filename
 */
function getBinaryName(binaryBaseName: string, platform: Platform): string {
  return platform === 'win32' ? `${binaryBaseName}.exe` : binaryBaseName
}

/**
 * Download a release from socket-btm.
 *
 * Generic function for downloading any socket-btm binary or asset.
 * Handles both platform-specific binaries and generic assets.
 *
 * @param config - Download configuration
 * @returns Path to the downloaded file
 *
 * @example
 * ```ts
 * // Binary: node-smol (like: brew install nodejs → node)
 * const nodePath = await downloadSocketBtmRelease({
 *   tool: 'node-smol',
 *   bin: 'node'
 * })
 *
 * // Binary: binject (like: cargo install binject → binject)
 * const binjectPath = await downloadSocketBtmRelease({
 *   tool: 'binject'
 * })
 *
 * // Binary: cross-platform
 * const binflatePath = await downloadSocketBtmRelease({
 *   tool: 'binflate',
 *   targetPlatform: 'linux',
 *   targetArch: 'x64',
 *   libc: 'musl'
 * })
 *
 * // Asset: WASM file
 * const yogaPath = await downloadSocketBtmRelease({
 *   tool: 'yoga-layout',
 *   asset: 'yoga-sync.mjs'
 * })
 *
 * // Asset: with custom output name
 * const ortPath = await downloadSocketBtmRelease({
 *   tool: 'onnxruntime',
 *   asset: 'ort-wasm-simd.wasm',
 *   output: 'ort.wasm'
 * })
 *
 * // Custom paths (like: gh release download --dir)
 * await downloadSocketBtmRelease({
 *   tool: 'node-smol',
 *   bin: 'node',
 *   cwd: '/path/to/project',
 *   downloadDir: 'build/cache'
 * })
 *
 * // Specific version (like: gh release download <tag>)
 * await downloadSocketBtmRelease({
 *   tool: 'binject',
 *   tag: 'binject-20260106-1df5745'
 * })
 * ```
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

    // Default output to asset name if not provided
    const outputName = output || asset

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
      assetName: asset,
      toolPrefix,
      tag,
      quiet,
      removeMacOSQuarantine,
    }
  } else {
    // Binary download
    const {
      bin,
      libc,
      removeMacOSQuarantine = true,
      targetArch,
      targetPlatform,
    } = config as SocketBtmBinaryConfig

    // Default bin to tool if not provided (like brew/cargo)
    const baseName = bin || tool

    // Resolve platform and arch based on host if not specified
    const platform = (targetPlatform || os.platform()) as Platform
    const arch = (targetArch || os.arch()) as Arch

    // Auto-detect libc variant on Linux if not specified
    const libcType = libc || detectLibc()

    // Build asset name and platform-arch identifier
    const assetName = getBinaryAssetName(baseName, platform, arch, libcType)
    const platformArch = getPlatformArch(platform, arch, libcType)
    const binaryName = getBinaryName(baseName, platform)

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
