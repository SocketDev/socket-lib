/**
 * @file Download helpers for dlx binaries — fetch tarballs from URLs, verify
 *   integrity, cache to disk with concurrency locking.
 *
 *   - `downloadBinary` — high-level URL→cached-binary flow
 *   - `downloadBinaryFile` — low-level fetch+verify with processLock Split out of
 *     `dlx/binary.ts` for size hygiene.
 */

import process from 'node:process'

import { getArch, WIN32 } from '../constants/platform'
import { DLX_BINARY_CACHE_TTL } from '../constants/time'
import { hash } from '../crypto/hash'
import { safeDelete, safeMkdir } from '../fs/safe'
import { httpDownload } from '../http-request/download'
import { normalizePath } from '../paths/normalize'
import { processLock } from '../process/lock-instance'
import { generateCacheKey } from './cache'

import { normalizeHash } from '../integrity'

import { ErrorCtor } from '../primordials/error'

import { getNodeCrypto } from '../node/crypto'
import { getNodeFs } from '../node/fs'
import { getNodePath } from '../node/path'
import {
  getDlxCachePath,
  isBinaryCacheValid,
  readBinaryCacheMetadata,
  writeBinaryCacheMetadata,
} from './binary-cache'

import type { DlxBinaryOptions } from './binary-types'

import { BufferFrom } from '../primordials/buffer'

/**
 * Download a binary from a URL with caching (without execution). Similar to
 * downloadNpmPackage from dlx/package.
 *
 * Returns `{binaryPath, downloaded, integrity}`. The `integrity` field is the
 * SRI-formatted `sha512-<base64>` hash of the cached file — computed by the
 * downloader on first fetch, persisted to cache metadata, and re-read on
 * subsequent cache hits. This supports the trust-on-first-use pattern:
 *
 * // 1. First call — caller has no pinned integrity yet. const { integrity } =
 * await downloadBinary({ url, name: 'tool' }) // Caller writes `integrity` back
 * to external-tools.json or similar.
 *
 * // 2. Subsequent calls — caller pins the integrity for verification. await
 * downloadBinary({ url, name: 'tool', hash: integrity })
 *
 * @example
 *   ```typescript
 *   const { binaryPath, integrity } = await downloadBinary({
 *   url: 'https://example.com/tool-linux-x64',
 *   name: 'tool',
 *   })
 *   console.log(`Binary at: ${binaryPath}, pin: ${integrity}`)
 *   ```
 *
 * @returns `{binaryPath, downloaded, integrity}` — binary location, whether
 *   this call fetched (vs. cache-hit), and the computed SRI integrity for
 *   future pinning.
 */
export async function downloadBinary(
  options: Omit<DlxBinaryOptions, 'spawnOptions'>,
): Promise<{ binaryPath: string; downloaded: boolean; integrity: string }> {
  const {
    cacheTtl = DLX_BINARY_CACHE_TTL,
    force = false,
    hash: hashSpec,
    integrity: rawIntegrity,
    name,
    sha256: rawSha256,
    url,
  } = { __proto__: null, ...options } as DlxBinaryOptions
  let integrity = rawIntegrity
  let sha256 = rawSha256
  if (hashSpec !== undefined) {
    const normalized = normalizeHash(hashSpec)
    if (normalized.type === 'integrity') {
      integrity = normalized.value
    } else {
      sha256 = normalized.value
    }
  }
  const fs = getNodeFs()
  const path = getNodePath()
  // Generate cache paths similar to pnpm/npx structure.
  const cacheDir = getDlxCachePath()
  const binaryName = name || `binary-${process.platform}-${getArch()}`
  // Create spec from URL and binary name for unique cache identity.
  const spec = `${url}:${binaryName}`
  const cacheKey = generateCacheKey(spec)
  const cacheEntryDir = path.join(cacheDir, cacheKey)
  const binaryPath = normalizePath(path.join(cacheEntryDir, binaryName))

  let downloaded = false
  let actualIntegrity = ''

  // Check if we need to download.
  if (
    !force &&
    fs.existsSync(cacheEntryDir) &&
    (await isBinaryCacheValid(cacheEntryDir, cacheTtl))
  ) {
    // Binary is cached and valid. Read the integrity from cache
    // metadata so callers doing trust-on-first-use can pin it
    // without re-fetching.
    downloaded = false
    const cachedMeta = await readBinaryCacheMetadata(cacheEntryDir)
    if (cachedMeta?.integrity) {
      actualIntegrity = cachedMeta.integrity
    } else {
      // Metadata missing or malformed — recompute from the on-disk
      // binary so the caller still gets a usable integrity string.
      const fileBuffer = await fs.promises.readFile(binaryPath)
      actualIntegrity = `sha512-${hash('sha512', fileBuffer, 'base64')}`
    }
  } else {
    // Ensure cache directory exists before downloading.
    try {
      await safeMkdir(cacheEntryDir)
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (code === 'EACCES' || code === 'EPERM') {
        throw new ErrorCtor(
          `Permission denied creating binary cache directory: ${cacheEntryDir}\n` +
            'Please check directory permissions or run with appropriate access.',
          { cause: e },
        )
      }
      if (code === 'EROFS') {
        throw new ErrorCtor(
          `Cannot create binary cache directory on read-only filesystem: ${cacheEntryDir}\n` +
            'Ensure the filesystem is writable or set SOCKET_DLX_DIR to a writable location.',
          { cause: e },
        )
      }
      throw new ErrorCtor(
        `Failed to create binary cache directory: ${cacheEntryDir}`,
        { cause: e },
      )
    }

    // Download the binary.
    actualIntegrity = await downloadBinaryFile(
      url,
      binaryPath,
      integrity,
      sha256,
    )

    // Get file size for metadata (intentional: need stats.size, not just existence).
    // oxlint-disable-next-line socket/prefer-exists-sync
    const stats = await fs.promises.stat(binaryPath)
    await writeBinaryCacheMetadata(
      cacheEntryDir,
      cacheKey,
      url,
      actualIntegrity,
      stats.size,
    )
    downloaded = true
  }

  return {
    binaryPath,
    downloaded,
    integrity: actualIntegrity,
  }
}

/**
 * Download a file from a URL with integrity checking and concurrent download
 * protection. Uses processLock to prevent multiple processes from downloading
 * the same binary simultaneously.
 *
 * Supports two integrity verification methods:
 *
 * - Sha256: Hex SHA-256 checksum (verified inline during download via
 *   httpDownload)
 * - Integrity: SRI format sha512-<base64> (verified post-download)
 *
 * The sha256 option is preferred as it fails early during download if the
 * checksum doesn't match.
 *
 * @example
 *   ```typescript
 *   const integrity = await downloadBinaryFile(
 *   'https://example.com/tool-linux-x64',
 *   '/tmp/dlx-cache/tool',
 *   )
 *   console.log(`Integrity: ${integrity}`)
 *   ```
 */
export async function downloadBinaryFile(
  url: string,
  destPath: string,
  integrity?: string | undefined,
  sha256?: string | undefined,
): Promise<string> {
  // Use process lock to prevent concurrent downloads.
  // Lock is placed in the cache entry directory as 'concurrency.lock'.
  const crypto = getNodeCrypto()
  const fs = getNodeFs()
  const path = getNodePath()
  const cacheEntryDir = path.dirname(destPath)
  const lockPath = path.join(cacheEntryDir, 'concurrency.lock')

  // Verify a freshly-computed SRI integrity matches caller pinning.
  // Used by both the cached-file path and the fresh-download path:
  // without the cached-file call, an integrity-pinned second caller
  // would silently trust whatever an earlier unpinned caller deposited
  // at destPath. Throws on mismatch + safeDeletes so the next call
  // re-downloads fresh.
  const verifyIntegrity = async (actualIntegrity: string): Promise<void> => {
    if (!integrity) {
      return
    }
    const integrityMatch =
      actualIntegrity.length === integrity.length &&
      crypto.timingSafeEqual(
        BufferFrom!(actualIntegrity),
        Buffer.from(integrity),
      )
    if (!integrityMatch) {
      await safeDelete(destPath)
      throw new ErrorCtor(
        `Integrity mismatch: expected ${integrity}, got ${actualIntegrity}`,
      )
    }
  }

  // Verify a buffer's sha256 matches caller pinning. ONLY called on the
  // cached-file path — the fresh-download path delegates sha256 to
  // httpDownload's inline verification (which fails early during the
  // download itself, before the byte stream finishes).
  const verifyCachedSha256 = async (fileBuffer: Buffer): Promise<void> => {
    if (!sha256) {
      return
    }
    const actualSha256 = hash('sha256', fileBuffer, 'hex')
    const sha256Match =
      actualSha256.length === sha256.length &&
      crypto.timingSafeEqual(
        BufferFrom!(actualSha256),
        Buffer.from(sha256.toLowerCase()),
      )
    if (!sha256Match) {
      await safeDelete(destPath)
      throw new ErrorCtor(
        `SHA-256 mismatch: expected ${sha256}, got ${actualSha256}`,
      )
    }
  }

  return await processLock.withLock(
    lockPath,
    async () => {
      // Check if file was downloaded while waiting for lock.
      if (fs.existsSync(destPath)) {
        // Need stats.size to validate file is non-empty before reuse.
        // oxlint-disable-next-line socket/prefer-exists-sync
        const stats = await fs.promises.stat(destPath)
        if (stats.size > 0) {
          const fileBuffer = await fs.promises.readFile(destPath)
          const actualIntegrity = `sha512-${hash('sha512', fileBuffer, 'base64')}`
          // Verify the cached file against caller pinning.
          await verifyIntegrity(actualIntegrity)
          await verifyCachedSha256(fileBuffer)
          return actualIntegrity
        }
      }

      // Download the file with optional SHA-256 verification.
      // The sha256 option enables inline verification during download,
      // which is more secure as it fails early if the checksum doesn't match.
      try {
        await httpDownload(url, destPath, sha256 ? { sha256 } : undefined)
      } catch (e) {
        throw new ErrorCtor(
          `Failed to download binary from ${url}\n` +
            `Destination: ${destPath}\n` +
            'Check your internet connection or verify the URL is accessible.',
          { cause: e },
        )
      }

      // Compute SRI integrity hash of downloaded file + verify against
      // caller pinning. sha256 was already verified inline by
      // httpDownload during the stream, so we don't re-check it here.
      const fileBuffer = await fs.promises.readFile(destPath)
      const actualIntegrity = `sha512-${hash('sha512', fileBuffer, 'base64')}`
      await verifyIntegrity(actualIntegrity)

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
