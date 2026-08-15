/**
 * @file Socket-btm binary asset/platform-arch naming helpers.
 */

import type { Arch, Libc, Platform } from '../constants/platform.mjs'

import { ErrorCtor } from '../primordials/error.mjs'

/**
 * Map Node.js platform to socket-btm asset platform naming. Identity mapping:
 * asset names use `process.platform` verbatim (`darwin`, `linux`, `win32`) to
 * align with pnpm's pack-app, the `--os` / `supportedArchitectures.os` config
 * keys, and the `@pnpm/exe.<os>-<arch>` package convention.
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

/**
 * Windows platform token per binary family. The node-smol pipeline names its
 * Windows assets with the RELEASE platform token (`node-win-x64.exe`), while
 * the binject/binflate/boringssl families keep `process.platform` verbatim
 * (`binject-win32-x64.exe`). Published releases are immutable, so this table
 * encodes the split rather than pretending one style exists.
 */
const WIN_TOKEN_BY_BASENAME = {
  __proto__: null,
  node: 'win',
} as unknown as Record<string, string>

/**
 * Get asset name for a socket-btm binary.
 *
 * @example
 *   ;```typescript
 *   getBinaryAssetName('lief', 'linux', 'x64', 'musl')
 *   // 'lief-linux-x64-musl'
 *   ```
 *
 * @param binaryBaseName - Binary basename (e.g., 'binject', 'node')
 * @param platform - Target platform.
 * @param arch - Target architecture.
 * @param libc - Linux libc variant (optional)
 *
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
    throw new ErrorCtor(`Unsupported architecture: ${arch}`)
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
    const winToken = WIN_TOKEN_BY_BASENAME[binaryBaseName] ?? 'win32'
    return `${binaryBaseName}-${winToken}-${mappedArch}${ext}`
  }

  throw new ErrorCtor(`Unsupported platform: ${platform}`)
}

/**
 * Get binary filename for output.
 *
 * @example
 *   ;```typescript
 *   getBinaryName('node', 'win32') // 'node.exe'
 *   getBinaryName('node', 'linux') // 'node'
 *   ```
 *
 * @param binaryBaseName - Binary basename (e.g., 'node', 'binject')
 * @param platform - Target platform.
 *
 * @returns Binary filename (e.g., 'node', 'node.exe')
 */
export function getBinaryName(
  binaryBaseName: string,
  platform: Platform,
): string {
  return platform === 'win32' ? `${binaryBaseName}.exe` : binaryBaseName
}

/**
 * Get the tag-infixed asset name for a socket-btm `.node` prebuilt.
 *
 * The `.node` addon families (e.g. opentui) name their release assets
 * `<tag>-<platformArch>.node` — release `opentui-20260424-18f0f46` carries
 * `opentui-20260424-18f0f46-linux-x64-musl.node`. On Windows those assets use
 * the release platform token `win` (`opentui-20260424-18f0f46-win-arm64.node`),
 * matching the node-smol convention in `WIN_TOKEN_BY_BASENAME`.
 *
 * @example
 *   ;```typescript
 *   getNodePrebuildAssetName('opentui-20260424-18f0f46', 'linux', 'x64', 'musl')
 *   // 'opentui-20260424-18f0f46-linux-x64-musl.node'
 *   getNodePrebuildAssetName('opentui-20260424-18f0f46', 'win32', 'arm64')
 *   // 'opentui-20260424-18f0f46-win-arm64.node'
 *   ```
 *
 * @param tag - Release tag name (e.g., 'opentui-20260424-18f0f46')
 * @param platform - Target platform.
 * @param arch - Target architecture.
 * @param libc - Linux libc variant (optional)
 *
 * @returns Asset name (e.g., 'opentui-20260424-18f0f46-darwin-arm64.node')
 */
export function getNodePrebuildAssetName(
  tag: string,
  platform: Platform,
  arch: Arch,
  libc?: Libc | undefined,
): string {
  const platformArch = getPlatformArch(platform, arch, libc)
  const assetPlatformArch =
    platform === 'win32'
      ? `win${platformArch.slice('win32'.length)}`
      : platformArch
  return `${tag}-${assetPlatformArch}.node`
}

/**
 * Get platform-arch identifier for directory structure and asset names.
 *
 * # Format: `<os>-<arch>[-<libc>]`
 *
 * The OS segment is `process.platform` verbatim: `darwin` / `linux` / `win32`.
 * The arch segment is `process.arch` verbatim: `x64` / `arm64`. The optional
 * libc suffix is `-musl` (Linux only; the glibc default is unsuffixed to match
 * Node.js's own linuxstatic convention).
 *
 * Every segment matches what npm and pnpm already expect verbatim, so nothing
 * downstream needs a translation map. Why each convention was chosen:
 * docs/references/repo/platform-arch-naming.md.
 *
 * @example
 *   getPlatformArch('linux', 'x64', 'musl') // 'linux-x64-musl'
 *   getPlatformArch('darwin', 'arm64') // 'darwin-arm64'
 *   getPlatformArch('win32', 'x64') // 'win32-x64'
 *   getPlatformArch('darwin', 'x64', 'musl') // 'darwin-x64', libc ignored
 *
 * @param platform - Target platform.
 * @param arch - Target architecture.
 * @param libc - Linux libc variant (optional; non-linux platforms ignore)
 *
 * @returns Platform-arch identifier (e.g., 'darwin-arm64', 'linux-x64-musl',
 *   'win32-x64')
 */
export function getPlatformArch(
  platform: Platform,
  arch: Arch,
  libc?: Libc | undefined,
): string {
  /* c8 ignore start - Unsupported-platform/arch arms fire only on inputs
     outside the PLATFORM_MAP / ARCH_MAP keysets; the musl-suffix arm fires
     only on linux+musl combos. */
  const mappedPlatform = PLATFORM_MAP[platform]
  if (!mappedPlatform) {
    throw new ErrorCtor(`Unsupported platform: ${platform}`)
  }

  const mappedArch = ARCH_MAP[arch]
  if (!mappedArch) {
    throw new ErrorCtor(`Unsupported architecture: ${arch}`)
  }

  const muslSuffix = platform === 'linux' && libc === 'musl' ? '-musl' : ''
  return `${mappedPlatform}-${mappedArch}${muslSuffix}`
  /* c8 ignore stop */
}
