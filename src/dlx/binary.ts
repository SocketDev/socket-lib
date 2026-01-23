/** @fileoverview DLX binary execution utilities for Socket ecosystem. */

import { getArch, WIN32 } from '../constants/platform'
import { DLX_BINARY_CACHE_TTL } from '../constants/time'

import { generateCacheKey } from './cache'
import { httpDownload } from '../http-request'
import { isDir, readJson, safeDelete, safeMkdir } from '../fs'
import { isObjectObject } from '../objects'
import { normalizePath } from '../paths/normalize'
import { getSocketDlxDir } from '../paths/socket'
import { processLock } from '../process-lock'
import { spawn } from '../spawn'

import type { SpawnExtra, SpawnOptions } from '../spawn'

let _crypto: typeof import('node:crypto') | undefined
/**
 * Lazily load the crypto module to avoid Webpack errors.
 * Uses non-'node:' prefixed require to prevent Webpack bundling issues.
 *
 * @private
 */
/*@__NO_SIDE_EFFECTS__*/
function getCrypto() {
  if (_crypto === undefined) {
    // Use non-'node:' prefixed require to avoid Webpack errors.

    _crypto = /*@__PURE__*/ require('crypto')
  }
  return _crypto as typeof import('node:crypto')
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

export interface DlxBinaryOptions {
  /**
   * URL to download the binary from.
   */
  url: string

  /**
   * Optional name for the cached binary (defaults to URL hash).
   */
  name?: string | undefined

  /**
   * Expected SRI integrity hash (sha512-<base64>) for verification.
   */
  integrity?: string | undefined

  /**
   * Cache TTL in milliseconds (default: 7 days).
   */
  cacheTtl?: number | undefined

  /**
   * Force re-download even if cached.
   * Aligns with npm/npx --force flag.
   */
  force?: boolean | undefined

  /**
   * Skip confirmation prompts (auto-approve).
   * Aligns with npx --yes/-y flag.
   */
  yes?: boolean | undefined

  /**
   * Suppress output (quiet mode).
   * Aligns with npx --quiet/-q and pnpm --silent/-s flags.
   */
  quiet?: boolean | undefined

  /**
   * Additional spawn options.
   */
  spawnOptions?: SpawnOptions | undefined
}

export interface DlxBinaryResult {
  /** Path to the cached binary. */
  binaryPath: string
  /** Whether the binary was newly downloaded. */
  downloaded: boolean
  /** The spawn promise for the running process. */
  spawnPromise: ReturnType<typeof spawn>
}

/**
 * Metadata structure for cached binaries (.dlx-metadata.json).
 * Unified schema shared across TypeScript (dlxBinary) and C++ stub extractor.
 *
 * Fields:
 * - version: Schema version (currently "1.0.0")
 * - cache_key: First 16 chars of SHA-512 hash (matches directory name)
 * - timestamp: Unix timestamp in milliseconds
 * - integrity: SRI hash (sha512-<base64>, aligned with npm)
 * - size: Size of cached binary in bytes
 * - source: Origin information
 *   - type: "download" | "extract" | "package"
 *   - url: Download URL (if type is "download")
 *   - path: Source binary path (if type is "extract")
 *   - spec: Package spec (if type is "package")
 * - update_check: Update checking metadata (optional)
 *   - last_check: Timestamp of last update check
 *   - last_notification: Timestamp of last user notification
 *   - latest_known: Latest known version string
 *
 * Example:
 * ```json
 * {
 *   "version": "1.0.0",
 *   "cache_key": "a1b2c3d4e5f67890",
 *   "timestamp": 1730332800000,
 *   "integrity": "sha512-abc123base64...",
 *   "size": 15000000,
 *   "source": {
 *     "type": "download",
 *     "url": "https://example.com/binary"
 *   },
 *   "update_check": {
 *     "last_check": 1730332800000,
 *     "last_notification": 1730246400000,
 *     "latest_known": "2.1.0"
 *   }
 * }
 * ```
 *
 * @internal This interface documents the metadata file format.
 */
export interface DlxMetadata {
  version: string
  cache_key: string
  timestamp: number
  integrity: string
  size: number
  source?: {
    type: 'download' | 'extract' | 'package'
    url?: string
    path?: string
    spec?: string
  }
  update_check?: {
    last_check: number
    last_notification: number
    latest_known: string
  }
}

/**
 * Get metadata file path for a cached binary.
 */
function getMetadataPath(cacheEntryPath: string): string {
  return getPath().join(cacheEntryPath, '.dlx-metadata.json')
}

/**
 * Check if a cached binary is still valid.
 */
async function isCacheValid(
  cacheEntryPath: string,
  cacheTtl: number,
): Promise<boolean> {
  const fs = getFs()
  try {
    const metaPath = getMetadataPath(cacheEntryPath)
    if (!fs.existsSync(metaPath)) {
      return false
    }

    const metadata = await readJson(metaPath, { throws: false })
    if (!isObjectObject(metadata)) {
      return false
    }
    const now = Date.now()
    const timestamp = (metadata as Record<string, unknown>)['timestamp']
    // If timestamp is missing or invalid, cache is invalid
    if (typeof timestamp !== 'number' || timestamp <= 0) {
      return false
    }
    const age = now - timestamp

    return age < cacheTtl
  } catch {
    return false
  }
}

/**
 * Download a file from a URL with integrity checking and concurrent download protection.
 * Uses processLock to prevent multiple processes from downloading the same binary simultaneously.
 * Internal helper function for downloading binary files.
 */
async function downloadBinaryFile(
  url: string,
  destPath: string,
  integrity?: string | undefined,
): Promise<string> {
  // Use process lock to prevent concurrent downloads.
  // Lock is placed in the cache entry directory as 'concurrency.lock'.
  const crypto = getCrypto()
  const fs = getFs()
  const path = getPath()
  const cacheEntryDir = path.dirname(destPath)
  const lockPath = path.join(cacheEntryDir, 'concurrency.lock')

  return await processLock.withLock(
    lockPath,
    async () => {
      // Check if file was downloaded while waiting for lock.
      if (fs.existsSync(destPath)) {
        const stats = await fs.promises.stat(destPath)
        if (stats.size > 0) {
          // File exists, compute and return SRI integrity hash.
          const fileBuffer = await fs.promises.readFile(destPath)
          const hash = crypto
            .createHash('sha512')
            .update(fileBuffer)
            .digest('base64')
          return `sha512-${hash}`
        }
      }

      // Download the file.
      try {
        await httpDownload(url, destPath)
      } catch (e) {
        throw new Error(
          `Failed to download binary from ${url}\n` +
            `Destination: ${destPath}\n` +
            'Check your internet connection or verify the URL is accessible.',
          { cause: e },
        )
      }

      // Compute SRI integrity hash of downloaded file.
      const fileBuffer = await fs.promises.readFile(destPath)
      const hash = crypto
        .createHash('sha512')
        .update(fileBuffer)
        .digest('base64')
      const actualIntegrity = `sha512-${hash}`

      // Verify integrity if provided.
      if (integrity && actualIntegrity !== integrity) {
        // Clean up invalid file.
        await safeDelete(destPath)
        throw new Error(
          `Integrity mismatch: expected ${integrity}, got ${actualIntegrity}`,
        )
      }

      // Make executable on POSIX systems.
      if (!WIN32) {
        await fs.promises.chmod(destPath, 0o755)
      }

      return actualIntegrity
    },
    {
      // Align with npm npx locking strategy.
      staleMs: 5000,
      touchIntervalMs: 2000,
    },
  )
}

/**
 * Write metadata for a cached binary.
 * Uses unified schema shared with C++ decompressor and CLI dlxBinary.
 * Schema documentation: See DlxMetadata interface in this file (exported).
 */
async function writeMetadata(
  cacheEntryPath: string,
  cacheKey: string,
  url: string,
  integrity: string,
  size: number,
): Promise<void> {
  const metaPath = getMetadataPath(cacheEntryPath)
  const metadata: DlxMetadata = {
    version: '1.0.0',
    cache_key: cacheKey,
    timestamp: Date.now(),
    integrity,
    size,
    source: {
      type: 'download',
      url,
    },
  }
  const fs = getFs()
  await fs.promises.writeFile(metaPath, JSON.stringify(metadata, null, 2))
}

/**
 * Clean expired entries from the DLX cache.
 */
export async function cleanDlxCache(
  maxAge: number = DLX_BINARY_CACHE_TTL,
): Promise<number> {
  const cacheDir = getDlxCachePath()
  const fs = getFs()

  if (!fs.existsSync(cacheDir)) {
    return 0
  }

  let cleaned = 0
  const now = Date.now()
  const path = getPath()
  const entries = await fs.promises.readdir(cacheDir)

  for (const entry of entries) {
    const entryPath = path.join(cacheDir, entry)
    const metaPath = getMetadataPath(entryPath)

    try {
      // eslint-disable-next-line no-await-in-loop
      if (!(await isDir(entryPath))) {
        continue
      }

      // eslint-disable-next-line no-await-in-loop
      const metadata = await readJson(metaPath, { throws: false })
      if (
        !metadata ||
        typeof metadata !== 'object' ||
        Array.isArray(metadata)
      ) {
        continue
      }
      const timestamp = (metadata as Record<string, unknown>)['timestamp']
      // If timestamp is missing or invalid, treat as expired (age = infinity)
      const age =
        typeof timestamp === 'number' && timestamp > 0
          ? now - timestamp
          : Number.POSITIVE_INFINITY

      if (age > maxAge) {
        // Remove entire cache entry directory.
        // eslint-disable-next-line no-await-in-loop
        await safeDelete(entryPath, { force: true, recursive: true })
        cleaned += 1
      }
    } catch {
      // If we can't read metadata, check if directory is empty or corrupted.
      try {
        // eslint-disable-next-line no-await-in-loop
        const contents = await fs.promises.readdir(entryPath)
        if (!contents.length) {
          // Remove empty directory.
          // eslint-disable-next-line no-await-in-loop
          await safeDelete(entryPath)
          cleaned += 1
        }
      } catch {}
    }
  }

  return cleaned
}

/**
 * Download and execute a binary from a URL with caching.
 */
export async function dlxBinary(
  args: readonly string[] | string[],
  options?: DlxBinaryOptions | undefined,
  spawnExtra?: SpawnExtra | undefined,
): Promise<DlxBinaryResult> {
  const {
    cacheTtl = DLX_BINARY_CACHE_TTL,
    force: userForce = false,
    integrity,
    name,
    spawnOptions,
    url,
    yes,
  } = { __proto__: null, ...options } as DlxBinaryOptions
  const fs = getFs()
  const path = getPath()
  // Map --yes flag to force behavior (auto-approve/skip prompts)
  const force = yes === true ? true : userForce
  // Generate cache paths similar to pnpm/npx structure.
  const cacheDir = getDlxCachePath()
  const binaryName = name || `binary-${process.platform}-${getArch()}`
  // Create spec from URL and binary name for unique cache identity.
  const spec = `${url}:${binaryName}`
  const cacheKey = generateCacheKey(spec)
  const cacheEntryDir = path.join(cacheDir, cacheKey)
  const binaryPath = normalizePath(path.join(cacheEntryDir, binaryName))

  let downloaded = false
  let computedIntegrity = integrity

  // Check if we need to download.
  if (
    !force &&
    fs.existsSync(cacheEntryDir) &&
    (await isCacheValid(cacheEntryDir, cacheTtl))
  ) {
    // Binary is cached and valid, read the integrity from metadata.
    try {
      const metaPath = getMetadataPath(cacheEntryDir)
      const metadata = await readJson(metaPath, { throws: false })
      if (
        metadata &&
        typeof metadata === 'object' &&
        !Array.isArray(metadata) &&
        typeof (metadata as Record<string, unknown>)['integrity'] === 'string'
      ) {
        computedIntegrity = (metadata as Record<string, unknown>)[
          'integrity'
        ] as string
      } else {
        // If metadata is invalid, re-download.
        downloaded = true
      }
    } catch {
      // If we can't read metadata, re-download.
      downloaded = true
    }
  } else {
    downloaded = true
  }

  if (downloaded) {
    // Ensure cache directory exists before downloading.
    try {
      await safeMkdir(cacheEntryDir)
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (code === 'EACCES' || code === 'EPERM') {
        throw new Error(
          `Permission denied creating binary cache directory: ${cacheEntryDir}\n` +
            'Please check directory permissions or run with appropriate access.',
          { cause: e },
        )
      }
      if (code === 'EROFS') {
        throw new Error(
          `Cannot create binary cache directory on read-only filesystem: ${cacheEntryDir}\n` +
            'Ensure the filesystem is writable or set SOCKET_DLX_DIR to a writable location.',
          { cause: e },
        )
      }
      throw new Error(
        `Failed to create binary cache directory: ${cacheEntryDir}`,
        { cause: e },
      )
    }

    // Download the binary.
    computedIntegrity = await downloadBinaryFile(url, binaryPath, integrity)

    // Get file size for metadata.
    const stats = await fs.promises.stat(binaryPath)
    await writeMetadata(
      cacheEntryDir,
      cacheKey,
      url,
      computedIntegrity || '',
      stats.size,
    )
  }

  // Execute the binary.
  // On Windows, script files (.bat, .cmd, .ps1) require shell: true because
  // they are not executable on their own and must be run through cmd.exe.
  // Note: .exe files are actual binaries and don't need shell mode.
  const needsShell = WIN32 && /\.(?:bat|cmd|ps1)$/i.test(binaryPath)
  // Windows cmd.exe PATH resolution behavior:
  // When shell: true on Windows with .cmd/.bat/.ps1 files, spawn will automatically
  // strip the full path down to just the basename without extension (e.g.,
  // C:\cache\test.cmd becomes just "test"). Windows cmd.exe then searches for "test"
  // in directories listed in PATH, trying each extension from PATHEXT environment
  // variable (.COM, .EXE, .BAT, .CMD, etc.) until it finds a match.
  //
  // Since our binaries are downloaded to a custom cache directory that's not in PATH
  // (unlike system package managers like npm/pnpm/yarn which are already in PATH),
  // we must prepend the cache directory to PATH so cmd.exe can locate the binary.
  //
  // This approach is consistent with how other tools handle Windows command execution:
  // - npm's promise-spawn: uses which.sync() to find commands in PATH
  // - cross-spawn: spawns cmd.exe with escaped arguments
  // - Node.js spawn with shell: true: delegates to cmd.exe which uses PATH
  const finalSpawnOptions = needsShell
    ? {
        ...spawnOptions,
        env: {
          ...spawnOptions?.env,
          PATH: `${cacheEntryDir}${getPath().delimiter}${process.env['PATH'] || ''}`,
        },
        shell: true,
      }
    : spawnOptions
  const spawnPromise = spawn(binaryPath, args, finalSpawnOptions, spawnExtra)

  return {
    binaryPath,
    downloaded,
    spawnPromise,
  }
}

/**
 * Download a binary from a URL with caching (without execution).
 * Similar to downloadPackage from dlx-package.
 *
 * @returns Object containing the path to the cached binary and whether it was downloaded
 */
export async function downloadBinary(
  options: Omit<DlxBinaryOptions, 'spawnOptions'>,
): Promise<{ binaryPath: string; downloaded: boolean }> {
  const {
    cacheTtl = DLX_BINARY_CACHE_TTL,
    force = false,
    integrity,
    name,
    url,
  } = { __proto__: null, ...options } as DlxBinaryOptions
  const fs = getFs()
  const path = getPath()
  // Generate cache paths similar to pnpm/npx structure.
  const cacheDir = getDlxCachePath()
  const binaryName = name || `binary-${process.platform}-${getArch()}`
  // Create spec from URL and binary name for unique cache identity.
  const spec = `${url}:${binaryName}`
  const cacheKey = generateCacheKey(spec)
  const cacheEntryDir = path.join(cacheDir, cacheKey)
  const binaryPath = normalizePath(path.join(cacheEntryDir, binaryName))

  let downloaded = false

  // Check if we need to download.
  if (
    !force &&
    fs.existsSync(cacheEntryDir) &&
    (await isCacheValid(cacheEntryDir, cacheTtl))
  ) {
    // Binary is cached and valid.
    downloaded = false
  } else {
    // Ensure cache directory exists before downloading.
    try {
      await safeMkdir(cacheEntryDir)
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (code === 'EACCES' || code === 'EPERM') {
        throw new Error(
          `Permission denied creating binary cache directory: ${cacheEntryDir}\n` +
            'Please check directory permissions or run with appropriate access.',
          { cause: e },
        )
      }
      if (code === 'EROFS') {
        throw new Error(
          `Cannot create binary cache directory on read-only filesystem: ${cacheEntryDir}\n` +
            'Ensure the filesystem is writable or set SOCKET_DLX_DIR to a writable location.',
          { cause: e },
        )
      }
      throw new Error(
        `Failed to create binary cache directory: ${cacheEntryDir}`,
        { cause: e },
      )
    }

    // Download the binary.
    const computedIntegrity = await downloadBinaryFile(
      url,
      binaryPath,
      integrity,
    )

    // Get file size for metadata.
    const stats = await fs.promises.stat(binaryPath)
    await writeMetadata(
      cacheEntryDir,
      cacheKey,
      url,
      computedIntegrity || '',
      stats.size,
    )
    downloaded = true
  }

  return {
    binaryPath,
    downloaded,
  }
}

/**
 * Execute a cached binary without re-downloading.
 * Similar to executePackage from dlx-package.
 * Binary must have been previously downloaded via downloadBinary or dlxBinary.
 *
 * @param binaryPath Path to the cached binary (from downloadBinary result)
 * @param args Arguments to pass to the binary
 * @param spawnOptions Spawn options for execution
 * @param spawnExtra Extra spawn configuration
 * @returns The spawn promise for the running process
 */
export function executeBinary(
  binaryPath: string,
  args: readonly string[] | string[],
  spawnOptions?: SpawnOptions | undefined,
  spawnExtra?: SpawnExtra | undefined,
): ReturnType<typeof spawn> {
  // On Windows, script files (.bat, .cmd, .ps1) require shell: true because
  // they are not executable on their own and must be run through cmd.exe.
  // Note: .exe files are actual binaries and don't need shell mode.
  const needsShell = WIN32 && /\.(?:bat|cmd|ps1)$/i.test(binaryPath)

  // Windows cmd.exe PATH resolution behavior:
  // When shell: true on Windows with .cmd/.bat/.ps1 files, spawn will automatically
  // strip the full path down to just the basename without extension. Windows cmd.exe
  // then searches for the binary in directories listed in PATH.
  //
  // Since our binaries are downloaded to a custom cache directory that's not in PATH,
  // we must prepend the cache directory to PATH so cmd.exe can locate the binary.
  const path = getPath()
  const cacheEntryDir = path.dirname(binaryPath)
  const finalSpawnOptions = needsShell
    ? {
        ...spawnOptions,
        env: {
          ...spawnOptions?.env,
          PATH: `${cacheEntryDir}${path.delimiter}${process.env['PATH'] || ''}`,
        },
        shell: true,
      }
    : spawnOptions

  return spawn(binaryPath, args, finalSpawnOptions, spawnExtra)
}

/**
 * Get the DLX binary cache directory path.
 * Returns normalized path for cross-platform compatibility.
 * Uses same directory as dlx-package for unified DLX storage.
 */
export function getDlxCachePath(): string {
  return getSocketDlxDir()
}

/**
 * Get information about cached binaries.
 */
export async function listDlxCache(): Promise<
  Array<{
    age: number
    integrity: string
    name: string
    size: number
    url: string
  }>
> {
  const cacheDir = getDlxCachePath()
  const fs = getFs()

  if (!fs.existsSync(cacheDir)) {
    return []
  }

  const results = []
  const now = Date.now()
  const path = getPath()
  const entries = await fs.promises.readdir(cacheDir)

  for (const entry of entries) {
    const entryPath = path.join(cacheDir, entry)
    try {
      // eslint-disable-next-line no-await-in-loop
      if (!(await isDir(entryPath))) {
        continue
      }

      const metaPath = getMetadataPath(entryPath)
      // eslint-disable-next-line no-await-in-loop
      const metadata = await readJson(metaPath, { throws: false })
      if (
        !metadata ||
        typeof metadata !== 'object' ||
        Array.isArray(metadata)
      ) {
        continue
      }

      const metaObj = metadata as Record<string, unknown>

      // Get URL from unified schema (source.url) or legacy schema (url).
      // Allow empty URL for backward compatibility with partial metadata.
      const source = metaObj['source'] as Record<string, unknown> | undefined
      const url =
        (source?.['url'] as string) || (metaObj['url'] as string) || ''

      // Find the binary file in the directory.
      // eslint-disable-next-line no-await-in-loop
      const files = await fs.promises.readdir(entryPath)
      const binaryFile = files.find(f => !f.startsWith('.'))

      if (binaryFile) {
        const binaryPath = path.join(entryPath, binaryFile)
        // eslint-disable-next-line no-await-in-loop
        const binaryStats = await fs.promises.stat(binaryPath)

        results.push({
          age: now - ((metaObj['timestamp'] as number) || 0),
          integrity: (metaObj['integrity'] as string) || '',
          name: binaryFile,
          size: binaryStats.size,
          url,
        })
      }
    } catch {}
  }

  return results
}
