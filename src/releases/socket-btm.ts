/**
 * @file Socket-btm release download utilities.
 */

import { getArch, getOs } from '../constants/platform'
import type { Arch, Libc, Platform } from '../constants/platform'
import { getReleaseAssetUrl } from './github-asset-url'
import { getLatestRelease } from './github-listing'
import { downloadGitHubRelease } from './github-downloads'
import {
  getBinaryAssetName,
  getBinaryName,
  getPlatformArch,
} from './socket-btm-binary-naming'

import { getNodeFs } from '../node/fs'

import type { AssetPattern, DownloadGitHubReleaseConfig } from './github-types'

import { ErrorCtor } from '../primordials/error'
export type { Arch, Libc, Platform }
export { getBinaryAssetName, getBinaryName, getPlatformArch }

/**
 * Socket-btm GitHub repository configuration.
 */
export const SOCKET_BTM_REPO = {
  owner: 'SocketDev',
  repo: 'socket-btm',
} as const

/**
 * Configuration for downloading socket-btm generic assets.
 */
export interface SocketBtmAssetConfig {
  /**
   * Asset name or pattern on GitHub.
   */
  asset: string | AssetPattern
  /**
   * @internal Discriminator fields
   */
  bin?: never | undefined
  /**
   * Working directory (defaults to process.cwd()).
   */
  cwd?: string | undefined
  /**
   * Download destination directory. @default 'build/downloaded'
   */
  downloadDir?: string | undefined
  /**
   * @internal Discriminator fields
   */
  libc?: never | undefined
  /**
   * Output filename. @default resolved asset name.
   */
  output?: string | undefined
  /**
   * Suppress log messages. @default false.
   */
  quiet?: boolean | undefined
  /**
   * Remove macOS quarantine attribute after download. @default false.
   */
  removeMacOSQuarantine?: boolean | undefined
  /**
   * Specific release tag to download.
   */
  tag?: string | undefined
  /**
   * @internal Discriminator fields
   */
  targetArch?: never | undefined
  /**
   * @internal Discriminator fields
   */
  targetPlatform?: never | undefined
}

/**
 * Configuration for downloading socket-btm binary releases.
 */
export interface SocketBtmBinaryConfig {
  /**
   * @internal Discriminator field
   */
  asset?: never | undefined
  /**
   * Binary/executable name (without extension). @default tool.
   */
  bin?: string | undefined
  /**
   * Working directory (defaults to process.cwd()).
   */
  cwd?: string | undefined
  /**
   * Download destination directory. @default 'build/downloaded'
   */
  downloadDir?: string | undefined
  /**
   * Linux libc variant. Auto-detected if not specified.
   */
  libc?: Libc | undefined
  /**
   * Suppress log messages. @default false.
   */
  quiet?: boolean | undefined
  /**
   * Remove macOS quarantine attribute after download. @default true.
   */
  removeMacOSQuarantine?: boolean | undefined
  /**
   * Specific release tag to download.
   */
  tag?: string | undefined
  /**
   * Target architecture (defaults to current arch).
   */
  targetArch?: Arch | undefined
  /**
   * Target platform (defaults to current platform).
   */
  targetPlatform?: Platform | undefined
}

/**
 * Configuration for downloading socket-btm releases (binary or asset).
 */
export type SocketBtmReleaseConfig =
  | SocketBtmBinaryConfig
  | SocketBtmAssetConfig

/**
 * Detect the libc variant (musl or glibc) on Linux systems. Returns undefined
 * for non-Linux platforms.
 *
 * @example
 *   ;```typescript
 *   const libc = detectLibc()
 *   console.log(libc) // 'glibc', 'musl', or undefined
 *   ```
 *
 * @returns 'musl', 'glibc', or undefined (for non-Linux)
 */
export function detectLibc(): Libc | undefined {
  // Non-linux early-return arm fires on macOS/Windows (the test
  // platform); linux-body is c8-ignored separately.
  /* c8 ignore next 3 */
  if (getOs() !== 'linux') {
    return undefined
  }

  /* c8 ignore start - Linux-only musl/glibc detection; tested on
     Linux runners. macOS/Windows runners take the early-return above. */
  try {
    const fs = getNodeFs()
    // Check for musl-specific dynamic linker.
    // These files only exist on musl systems.
    const muslPaths = [
      '/lib/ld-musl-x86_64.so.1',
      '/lib/ld-musl-aarch64.so.1',
      '/usr/lib/ld-musl-x86_64.so.1',
      '/usr/lib/ld-musl-aarch64.so.1',
    ]

    for (let i = 0, { length } = muslPaths; i < length; i += 1) {
      const path = muslPaths[i]!
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
  /* c8 ignore stop */
}

/**
 * Download a release from socket-btm.
 *
 * @example
 *   ;```typescript
 *   const binPath = await downloadSocketBtmRelease('lief', {
 *     downloadDir: '/tmp/build/downloaded',
 *   })
 *   ```
 *
 * @param tool - Tool/package name for release matching (e.g., 'lief', 'curl')
 * @param options - Download configuration.
 *
 * @returns Path to the downloaded file
 */
export async function downloadSocketBtmRelease(
  tool: string,
  options: SocketBtmReleaseConfig | undefined,
): Promise<string> {
  // options-undefined fallback fires when caller omits options.
  /* c8 ignore next */
  const config = { __proto__: null, ...(options ?? {}) } as unknown as {
    cwd?: string | undefined
    downloadDir?: string | undefined
    quiet?: boolean | undefined
    tag?: string | undefined
  }
  const { cwd, downloadDir, quiet = false, tag } = config

  // Auto-generate toolPrefix from tool name (follows socket-btm tag pattern: {tool}-{date}-{commit})
  const toolPrefix = `${tool}-`

  let downloadConfig: DownloadGitHubReleaseConfig

  // Infer type from presence of 'asset' field
  if (options && 'asset' in options) {
    // Asset download
    const assetConfig = {
      __proto__: null,
      ...(options as SocketBtmAssetConfig),
    } as SocketBtmAssetConfig
    const { asset, output, removeMacOSQuarantine = false } = assetConfig

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
        throw new ErrorCtor(
          'Cannot use asset pattern with explicit tag. Either provide exact asset name or omit tag.',
        )
      }

      // Find latest release with matching asset.
      resolvedTag =
        (await getLatestRelease(toolPrefix, SOCKET_BTM_REPO, {
          assetPattern: asset,
        })) ?? undefined

      if (!resolvedTag) {
        throw new ErrorCtor(
          `No ${tool} release with matching asset pattern found`,
        )
      }

      const assetUrl = await getReleaseAssetUrl(
        resolvedTag,
        asset,
        SOCKET_BTM_REPO,
      )

      // No-asset throw and split-pop-fallback fire only on edge cases.
      /* c8 ignore start */
      if (!assetUrl) {
        throw new ErrorCtor(`No matching asset found in release ${resolvedTag}`)
      }
      resolvedAsset = assetUrl.split('/').pop() || asset.toString()
      /* c8 ignore stop */
    }

    // output-undefined fallback fires when caller omits output.
    /* c8 ignore next */
    const outputName = output || resolvedAsset

    // For non-binary assets, use a simple 'assets' directory instead of platform-arch
    const platformArch = 'assets'

    downloadConfig = {
      owner: SOCKET_BTM_REPO.owner,
      repo: SOCKET_BTM_REPO.repo,
      ...(cwd !== undefined && { cwd }),
      ...(downloadDir !== undefined && { downloadDir }),
      toolName: tool,
      platformArch,
      binaryName: outputName,
      assetName: resolvedAsset,
      toolPrefix,
      ...(resolvedTag !== undefined && { tag: resolvedTag }),
      quiet,
      removeMacOSQuarantine,
    }
  } else {
    // Binary download
    const binaryConfig = {
      __proto__: null,
      ...(options as SocketBtmBinaryConfig | undefined),
    } as SocketBtmBinaryConfig
    const {
      bin,
      libc = detectLibc(),
      removeMacOSQuarantine = true,
      targetArch = getArch(),
      targetPlatform = getOs(),
    } = binaryConfig

    // Default bin to tool if not provided (like brew/cargo)
    const baseName = bin || tool

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
      ...(cwd !== undefined && { cwd }),
      ...(downloadDir !== undefined && { downloadDir }),
      toolName: tool,
      platformArch,
      binaryName,
      assetName,
      toolPrefix,
      ...(tag !== undefined && { tag }),
      quiet,
      removeMacOSQuarantine,
    }
  }

  return await downloadGitHubRelease(downloadConfig)
}
