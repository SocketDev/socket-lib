/**
 * @fileoverview Socket-btm release download utilities.
 */

import {
  type Arch,
  getArch,
  type Libc,
  getPlatform,
  type Platform,
} from '../constants/platform'
import { getLatestRelease, getReleaseAssetUrl } from './github-api'
import { downloadGitHubRelease } from './github-downloads'

import type {
  AssetPattern,
  DownloadGitHubReleaseConfig,
} from './github-types'

export type { Arch, Libc, Platform }

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
  /** Asset name or pattern on GitHub. */
  asset: string | AssetPattern
  /** @internal Discriminator fields */
  bin?: never
  /** Working directory (defaults to process.cwd()). */
  cwd?: string | undefined
  /** Download destination directory. @default 'build/downloaded' */
  downloadDir?: string | undefined
  /** @internal Discriminator fields */
  libc?: never
  /** Output filename. @default resolved asset name */
  output?: string | undefined
  /** Suppress log messages. @default false */
  quiet?: boolean | undefined
  /** Remove macOS quarantine attribute after download. @default false */
  removeMacOSQuarantine?: boolean | undefined
  /** Specific release tag to download. */
  tag?: string | undefined
  /** @internal Discriminator fields */
  targetArch?: never
  /** @internal Discriminator fields */
  targetPlatform?: never
}

/**
 * Configuration for downloading socket-btm binary releases.
 */
export interface SocketBtmBinaryConfig {
  /** @internal Discriminator field */
  asset?: never
  /** Binary/executable name (without extension). @default tool */
  bin?: string | undefined
  /** Working directory (defaults to process.cwd()). */
  cwd?: string | undefined
  /** Download destination directory. @default 'build/downloaded' */
  downloadDir?: string | undefined
  /** Linux libc variant. Auto-detected if not specified. */
  libc?: Libc | undefined
  /** Suppress log messages. @default false */
  quiet?: boolean | undefined
  /** Remove macOS quarantine attribute after download. @default true */
  removeMacOSQuarantine?: boolean | undefined
  /** Specific release tag to download. */
  tag?: string | undefined
  /** Target architecture (defaults to current arch). */
  targetArch?: Arch | undefined
  /** Target platform (defaults to current platform). */
  targetPlatform?: Platform | undefined
}

/**
 * Configuration for downloading socket-btm releases (binary or asset).
 */
export type SocketBtmReleaseConfig =
  | SocketBtmBinaryConfig
  | SocketBtmAssetConfig

/**
 * Map Node.js platform to socket-btm asset platform naming.
 * Identity mapping: asset names use `process.platform` verbatim
 * (`darwin`, `linux`, `win32`) to align with pnpm's pack-app, the
 * `--os` / `supportedArchitectures.os` config keys, and the
 * `@pnpm/exe.<os>-<arch>` package convention.
 */
const PLATFORM_MAP = {
  __proto__: null,
  darwin: 'darwin',
  linux: 'linux',
  win32: 'win32',
} as unknown as Record<string, string>

/**
 * Map Node.js arch to socket-btm asset arch naming.
 */
const ARCH_MAP = {
  __proto__: null,
  arm64: 'arm64',
  x64: 'x64',
} as unknown as Record<string, string>

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

    _fs = /*@__PURE__*/ require('node:fs')
  }
  return _fs as typeof import('node:fs')
}

/**
 * Detect the libc variant (musl or glibc) on Linux systems.
 * Returns undefined for non-Linux platforms.
 *
 * @returns 'musl', 'glibc', or undefined (for non-Linux)
 *
 * @example
 * ```typescript
 * const libc = detectLibc()
 * console.log(libc) // 'glibc', 'musl', or undefined
 * ```
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
 * @param tool - Tool/package name for release matching (e.g., 'lief', 'curl')
 * @param options - Download configuration
 * @returns Path to the downloaded file
 *
 * @example
 * ```typescript
 * const binPath = await downloadSocketBtmRelease('lief', {
 *   downloadDir: '/tmp/build/downloaded',
 * })
 * ```
 */
export async function downloadSocketBtmRelease(
  tool: string,
  options: SocketBtmReleaseConfig | undefined,
): Promise<string> {
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
        throw new Error(
          'Cannot use asset pattern with explicit tag. Either provide exact asset name or omit tag.',
        )
      }

      // Find latest release with matching asset.
      resolvedTag =
        (await getLatestRelease(toolPrefix, SOCKET_BTM_REPO, {
          assetPattern: asset,
        })) ?? undefined

      if (!resolvedTag) {
        throw new Error(`No ${tool} release with matching asset pattern found`)
      }

      const assetUrl = await getReleaseAssetUrl(
        resolvedTag,
        asset,
        SOCKET_BTM_REPO,
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
      targetPlatform = getPlatform(),
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

/**
 * Get asset name for a socket-btm binary.
 *
 * @param binaryBaseName - Binary basename (e.g., 'binject', 'node')
 * @param platform - Target platform
 * @param arch - Target architecture
 * @param libc - Linux libc variant (optional)
 * @returns Asset name (e.g., 'binject-darwin-arm64', 'node-linux-x64-musl')
 *
 * @example
 * ```typescript
 * getBinaryAssetName('lief', 'linux', 'x64', 'musl')
 * // 'lief-linux-x64-musl'
 * ```
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
    return `${binaryBaseName}-win32-${mappedArch}${ext}`
  }

  throw new Error(`Unsupported platform: ${platform}`)
}

/**
 * Get binary filename for output.
 *
 * @param binaryBaseName - Binary basename (e.g., 'node', 'binject')
 * @param platform - Target platform
 * @returns Binary filename (e.g., 'node', 'node.exe')
 *
 * @example
 * ```typescript
 * getBinaryName('node', 'win32')  // 'node.exe'
 * getBinaryName('node', 'linux')  // 'node'
 * ```
 */
export function getBinaryName(
  binaryBaseName: string,
  platform: Platform,
): string {
  return platform === 'win32' ? `${binaryBaseName}.exe` : binaryBaseName
}

/**
 * Get platform-arch identifier for directory structure and asset names.
 *
 * # Format: `<os>-<arch>[-<libc>]`
 *
 * The OS segment is `process.platform` verbatim: `darwin` / `linux` /
 * `win32`. The arch segment is `process.arch` verbatim: `x64` / `arm64`.
 * The optional libc suffix is `-musl` (Linux only; the glibc default is
 * unsuffixed to match Node.js's own linuxstatic convention).
 *
 * # Why these specific conventions
 *
 * ## Why `win32`, not `win`
 *
 * `win32` is what `process.platform` returns on every Windows host. Every
 * npm package whose install-time platform filter uses the standard
 * `os` / `cpu` / `libc` manifest fields must match `process.platform`
 * strings exactly (npm compares them verbatim — there's no shorthand
 * layer). Using `win` internally here would have forced a translation
 * every time we constructed an install filter or a target triple, and
 * reviewers would have to remember "we abbreviate on disk but not in
 * package filters." Since the two now match, there's no translation
 * step to get wrong.
 *
 * pnpm's pack-app (v11+) accepts `<os>-<arch>[-<libc>]` target strings
 * and its shards are `@pnpm/exe.<os>-<arch>` (with `win32`, not `win` —
 * see pnpm#11314). Our naming matches so asset names we emit can flow
 * directly into pack-app's `--target` arg, `pnpm.app.targets` config,
 * and sibling-package-name construction without a translation map.
 *
 * ## Why `-musl` is the suffix (and glibc is unsuffixed)
 *
 * Node.js's own linuxstatic tarballs historically used the unqualified
 * `linux` for glibc and a separate download channel for musl. The pnpm
 * ecosystem codified that as `linux-<arch>` (glibc, default) and
 * `linux-<arch>-musl` (the libc outlier), matching the asymmetric
 * reality of Linux distros — glibc is the majority case, musl is
 * Alpine-and-similar. Adding `-glibc` for the default would be
 * redundant noise in the name.
 *
 * ## Why libc is only appended for Linux
 *
 * macOS and Windows have exactly one system libc each (Apple libSystem,
 * Microsoft UCRT). A hypothetical `darwin-arm64-libsystem` conveys no
 * information. Node.js, npm, and pnpm all treat libc as a Linux-only
 * axis; we follow the same convention so callers don't have to special-
 * case `'darwin-arm64'.startsWith('darwin-arm64')` style matches.
 *
 * ## Why this function exists at all (vs. inlining)
 *
 * Two upstream APIs that socket-btm consumers end up calling — the
 * npm manifest filter (`os`/`cpu`/`libc`) and pnpm's pack-app
 * `--target` — both need the exact same triple format. Centralizing
 * the construction here means a future schema change (e.g. Node
 * introducing `riscv64`) gets one edit, and the error message for an
 * unsupported platform is uniform across downloaders, pack-app
 * invocations, and the `@socketbin/*` resolver logic.
 *
 * @param platform - Target platform
 * @param arch - Target architecture
 * @param libc - Linux libc variant (optional; non-linux platforms ignore)
 * @returns Platform-arch identifier (e.g., 'darwin-arm64', 'linux-x64-musl', 'win32-x64')
 *
 * @example
 * ```typescript
 * getPlatformArch('linux', 'x64', 'musl')  // 'linux-x64-musl'
 * getPlatformArch('darwin', 'arm64')       // 'darwin-arm64'
 * getPlatformArch('win32', 'x64')          // 'win32-x64'
 * getPlatformArch('darwin', 'x64', 'musl') // 'darwin-x64' — libc ignored
 * ```
 */
export function getPlatformArch(
  platform: Platform,
  arch: Arch,
  libc?: Libc | undefined,
): string {
  const mappedPlatform = PLATFORM_MAP[platform]
  if (!mappedPlatform) {
    throw new Error(`Unsupported platform: ${platform}`)
  }

  const mappedArch = ARCH_MAP[arch]
  if (!mappedArch) {
    throw new Error(`Unsupported architecture: ${arch}`)
  }

  const muslSuffix = platform === 'linux' && libc === 'musl' ? '-musl' : ''
  return `${mappedPlatform}-${mappedArch}${muslSuffix}`
}
