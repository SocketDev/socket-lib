/** @fileoverview DLX binary execution utilities for Socket ecosystem. */

import { createHash } from 'node:crypto'
import { existsSync, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { WIN32 } from '#constants/platform'

import { generateCacheKey } from './dlx'
import { downloadWithLock } from './download-lock'
import { isDir, readJson, safeDelete } from './fs'
import { isObjectObject } from './objects'
import { normalizePath } from './path'
import { getSocketDlxDir } from './paths'
import type { SpawnExtra, SpawnOptions } from './spawn'
import { spawn } from './spawn'

export interface DlxBinaryOptions {
  /** URL to download the binary from. */
  url: string
  /** Optional name for the cached binary (defaults to URL hash). */
  name?: string | undefined
  /** Expected checksum (sha256) for verification. */
  checksum?: string | undefined
  /** Cache TTL in milliseconds (default: 7 days). */
  cacheTtl?: number | undefined
  /** Force re-download even if cached. */
  force?: boolean | undefined
  /** Additional spawn options. */
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
 * Get metadata file path for a cached binary.
 */
function getMetadataPath(cacheEntryPath: string): string {
  return path.join(cacheEntryPath, '.dlx-metadata.json')
}

/**
 * Check if a cached binary is still valid.
 */
async function isCacheValid(
  cacheEntryPath: string,
  cacheTtl: number,
): Promise<boolean> {
  try {
    const metaPath = getMetadataPath(cacheEntryPath)
    if (!existsSync(metaPath)) {
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
 * Uses downloadWithLock to prevent multiple processes from downloading the same binary simultaneously.
 */
async function downloadBinary(
  url: string,
  destPath: string,
  checksum?: string | undefined,
): Promise<string> {
  // Use downloadWithLock to handle concurrent download protection.
  // This prevents corruption when multiple processes try to download the same binary.
  await downloadWithLock(url, destPath, {
    // Align with npm's npx locking strategy.
    staleTimeout: 10_000,
    // Allow up to 2 minutes for large binary downloads.
    lockTimeout: 120_000,
  })

  // Compute checksum of downloaded file.
  const fileBuffer = await fs.readFile(destPath)
  const hasher = createHash('sha256')
  hasher.update(fileBuffer)
  const actualChecksum = hasher.digest('hex')

  // Verify checksum if provided.
  if (checksum && actualChecksum !== checksum) {
    // Clean up invalid file.
    await safeDelete(destPath)
    throw new Error(
      `Checksum mismatch: expected ${checksum}, got ${actualChecksum}`,
    )
  }

  // Make executable on POSIX systems.
  if (!WIN32) {
    await fs.chmod(destPath, 0o755)
  }

  return actualChecksum
}

/**
 * Write metadata for a cached binary.
 */
async function writeMetadata(
  cacheEntryPath: string,
  url: string,
  checksum: string,
): Promise<void> {
  const metaPath = getMetadataPath(cacheEntryPath)
  const metadata = {
    arch: os.arch(),
    checksum,
    platform: os.platform(),
    timestamp: Date.now(),
    url,
    version: '1.0.0',
  }
  await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2))
}

/**
 * Clean expired entries from the DLX cache.
 */
export async function cleanDlxCache(
  maxAge: number = /*@__INLINE__*/ require('#constants/time').DLX_BINARY_CACHE_TTL,
): Promise<number> {
  const cacheDir = getDlxCachePath()

  if (!existsSync(cacheDir)) {
    return 0
  }

  let cleaned = 0
  const now = Date.now()
  const entries = await fs.readdir(cacheDir)

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
        const contents = await fs.readdir(entryPath)
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
    cacheTtl = /*@__INLINE__*/ require('#constants/time').DLX_BINARY_CACHE_TTL,
    checksum,
    force = false,
    name,
    spawnOptions,
    url,
  } = { __proto__: null, ...options } as DlxBinaryOptions

  // Generate cache paths similar to pnpm/npx structure.
  const cacheDir = getDlxCachePath()
  const binaryName = name || `binary-${process.platform}-${os.arch()}`
  // Create spec from URL and binary name for unique cache identity.
  const spec = `${url}:${binaryName}`
  const cacheKey = generateCacheKey(spec)
  const cacheEntryDir = path.join(cacheDir, cacheKey)
  const binaryPath = normalizePath(path.join(cacheEntryDir, binaryName))

  let downloaded = false
  let computedChecksum = checksum

  // Check if we need to download.
  if (
    !force &&
    existsSync(cacheEntryDir) &&
    (await isCacheValid(cacheEntryDir, cacheTtl))
  ) {
    // Binary is cached and valid, read the checksum from metadata.
    try {
      const metaPath = getMetadataPath(cacheEntryDir)
      const metadata = await readJson(metaPath, { throws: false })
      if (
        metadata &&
        typeof metadata === 'object' &&
        !Array.isArray(metadata) &&
        typeof (metadata as Record<string, unknown>)['checksum'] === 'string'
      ) {
        computedChecksum = (metadata as Record<string, unknown>)[
          'checksum'
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
    // Ensure cache directory exists.
    await fs.mkdir(cacheEntryDir, { recursive: true })

    // Download the binary.
    computedChecksum = await downloadBinary(url, binaryPath, checksum)
    await writeMetadata(cacheEntryDir, url, computedChecksum || '')
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
          PATH: `${cacheEntryDir}${path.delimiter}${process.env['PATH'] || ''}`,
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
    arch: string
    checksum: string
    name: string
    platform: string
    size: number
    url: string
  }>
> {
  const cacheDir = getDlxCachePath()

  if (!existsSync(cacheDir)) {
    return []
  }

  const results = []
  const now = Date.now()
  const entries = await fs.readdir(cacheDir)

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

      // Find the binary file in the directory.
      // eslint-disable-next-line no-await-in-loop
      const files = await fs.readdir(entryPath)
      const binaryFile = files.find(f => !f.startsWith('.'))

      if (binaryFile) {
        const binaryPath = path.join(entryPath, binaryFile)
        // eslint-disable-next-line no-await-in-loop
        const binaryStats = await fs.stat(binaryPath)

        const metaObj = metadata as Record<string, unknown>
        results.push({
          age: now - ((metaObj['timestamp'] as number) || 0),
          arch: (metaObj['arch'] as string) || 'unknown',
          checksum: (metaObj['checksum'] as string) || '',
          name: binaryFile,
          platform: (metaObj['platform'] as string) || 'unknown',
          size: binaryStats.size,
          url: (metaObj['url'] as string) || '',
        })
      }
    } catch {}
  }

  return results
}
