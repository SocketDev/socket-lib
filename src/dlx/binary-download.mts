/**
 * @file Download helpers for dlx binaries — fetch tarballs from URLs, verify
 *   integrity, cache to disk with concurrency locking.
 *
 *   - `downloadBinary` — high-level URL→cached-binary flow
 *   - `downloadBinaryFile` — low-level fetch+verify with processLock Split out of
 *     `dlx/binary.ts` for size hygiene.
 */

import { getArch, isWin32 } from '../constants/platform.mjs'
import { DLX_BINARY_CACHE_TTL } from '../constants/time.mjs'
import { isError } from '../errors/predicates.mjs'
import { safeDelete, safeMkdir } from '../fs/safe.mjs'
import { httpDownload } from '../http-request/download.mjs'
import { normalizePath } from '../paths/normalize.mjs'
import { processLock } from '../process/lock-instance.mjs'
import { generateCacheKey } from './cache.mjs'

import { parseHash } from '../crypto/integrity.mjs'

import { ErrorCtor } from '../primordials/error.mjs'
import { StringPrototypeStartsWith } from '../primordials/string.mjs'

import { getNodeCrypto } from '../node/crypto.mjs'
import { getNodeFs } from '../node/fs.mjs'
import { getNodePath } from '../node/path.mjs'
import {
  getDlxCachePath,
  isBinaryCacheValid,
  readBinaryCacheMetadata,
  writeBinaryCacheMetadata,
} from './binary-cache.mjs'

import type { DlxBinaryOptions } from './binary-types.mjs'
import type { HttpDownloadWriteStreamFactory } from '../http-request/download-types.mjs'

import { BufferFrom } from '../primordials/buffer.mjs'
import { getNodeProcess } from '../node/process.mjs'

/**
 * Download a binary from a URL with caching, without executing it. Similar to
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
    createWriteStream,
    force = false,
    hash: hashSpec,
    headers,
    integrity: rawIntegrity,
    name,
    sha256: rawSha256,
    url,
  } = { __proto__: null, ...options } as DlxBinaryOptions
  let integrity = rawIntegrity
  let sha256 = rawSha256
  if (hashSpec !== undefined) {
    const parsed = parseHash(hashSpec)
    if (parsed.algorithm === 'sha256') {
      sha256 = parsed.hex
    } else {
      integrity = parsed.sri
    }
  }
  const fs = getNodeFs()
  const path = getNodePath()
  // Generate cache paths similar to pnpm/npx structure.
  const cacheDir = getDlxCachePath()
  const nodeProcess = getNodeProcess()
  const binaryName = name || `binary-${nodeProcess.platform}-${getArch()}`
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
    // Measure the on-disk bytes against the caller's pin before reusing them.
    // The metadata records what some earlier call deposited, so trusting it
    // would let the cache vouch for itself.
    const digests = await verifyCachedBinary(binaryPath, { integrity, sha256 })
    const cachedMeta = await readBinaryCacheMetadata(cacheEntryDir)
    actualIntegrity = cachedMeta?.integrity ?? digests.integrity
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
    actualIntegrity = await downloadBinaryFile(url, binaryPath, {
      createWriteStream,
      headers,
      integrity,
      sha256,
    })

    // Get file size for metadata (intentional: need stats.size, not just existence).
    // oxlint-disable-next-line socket/prefer-exists-sync -- need stats.size
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

export interface DownloadBinaryFileOptions {
  /**
   * Factory for the destination write stream. Injected by tests and by callers
   * that need to tee or throttle the download.
   */
  createWriteStream?: HttpDownloadWriteStreamFactory | undefined
  /**
   * Extra request headers, forwarded to `httpDownload`. Needed for an asset
   * behind auth: a private GitHub release answers an unauthenticated request
   * with a bare 404, which reads as "never published" rather than "not
   * allowed".
   */
  headers?: Record<string, string> | undefined
  /**
   * SRI string (`sha512-<base64>`) the download must match, verified from the
   * response stream before the temp file is atomically published.
   */
  integrity?: string | undefined
  /**
   * Hex SHA-256 the download must match, verified from the same stream.
   */
  sha256?: string | undefined
}

/**
 * Download a file from a URL with integrity checking and concurrent download
 * protection. Uses processLock to prevent multiple processes from downloading
 * the same binary simultaneously.
 *
 * Supports two integrity verification methods:
 *
 * - Sha256: Hex SHA-256 checksum (verified from the download stream via
 *   httpDownload)
 * - Integrity: SRI format sha512-<base64>, verified from the same stream
 *
 * Both checks happen before the download temp is atomically published.
 *
 * @example
 *   ```typescript
 *   const integrity = await downloadBinaryFile(
 *   'https://example.com/tool-linux-x64',
 *   '/tmp/dlx-cache/tool',
 *   { integrity: 'sha512-…' },
 *   )
 *   console.log(`Integrity: ${integrity}`)
 *   ```
 */
export async function downloadBinaryFile(
  url: string,
  destPath: string,
  options?: DownloadBinaryFileOptions | undefined,
): Promise<string> {
  const { createWriteStream, headers, integrity, sha256 } = {
    __proto__: null,
    ...options,
  } as DownloadBinaryFileOptions
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

  // Verify a streamed sha256 matches caller pinning. This is only called on the
  // cached-file path; fresh downloads are verified by httpDownload before its
  // atomic publication.
  const verifyCachedSha256 = async (actualSha256: string): Promise<void> => {
    if (!sha256) {
      return
    }
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
        // oxlint-disable-next-line socket/prefer-exists-sync -- need stats.size to validate file is non-empty
        const stats = await fs.promises.stat(destPath)
        if (stats.size > 0) {
          const digests = await hashBinaryFile(destPath)
          // Verify the cached file against caller pinning.
          await verifyIntegrity(digests.integrity)
          await verifyCachedSha256(digests.sha256)
          return digests.integrity
        }
      }

      // Download the file while computing both verification digests in the
      // response pass.
      let result
      try {
        result = await httpDownload(url, destPath, {
          createWriteStream,
          ...(headers ? { headers } : {}),
          integrity,
          sha256,
        })
      } catch (e) {
        if (
          integrity &&
          isError(e) &&
          StringPrototypeStartsWith(e.message, 'Integrity verification failed')
        ) {
          throw new ErrorCtor(`Integrity mismatch: expected ${integrity}`, {
            cause: e,
          })
        }
        throw new ErrorCtor(
          `Failed to download binary from ${url}\n` +
            `Destination: ${destPath}\n` +
            'Check your internet connection or verify the URL is accessible.',
          { cause: e },
        )
      }
      await verifyIntegrity(result.integrity)

      // Make executable on POSIX systems.
      if (!isWin32()) {
        await fs.promises.chmod(destPath, 0o755)
      }

      return result.integrity
    },
    {
      // Align with npm npx locking strategy.
      staleMs: 5000,
      touchIntervalMs: 2000,
    },
  )
}

export interface BinaryFileDigests {
  integrity: string
  sha256: string
}

/**
 * Compute both DLX digests in one bounded-memory file pass.
 */
export async function hashBinaryFile(
  filePath: string,
): Promise<BinaryFileDigests> {
  const crypto = getNodeCrypto()
  const fs = getNodeFs()
  const sha256Hash = crypto.createHash('sha256')
  const sha512Hash = crypto.createHash('sha512')
  const stream = fs.createReadStream(filePath)
  for await (const chunk of stream) {
    sha256Hash.update(chunk as Buffer)
    sha512Hash.update(chunk as Buffer)
  }
  return {
    integrity: `sha512-${sha512Hash.digest('base64')}`,
    sha256: sha256Hash.digest('hex'),
  }
}

/**
 * Check a cached binary against the caller's pin.
 *
 * A cache HIT skips the download, and with it every check the download
 * performs, so a caller that pinned a hash needs the on-disk bytes measured
 * here or the pin governs only the first fetch on each machine. Anything able
 * to write the dlx cache would otherwise reach execution. Fails closed: the
 * mismatching file is deleted so the next call fetches again, and the caller
 * sees the throw.
 *
 * Returns the digests it computed so a caller doing trust-on-first-use can
 * reuse them instead of hashing the file twice. With no pin supplied there is
 * nothing to compare, and the digests are still returned.
 */
export async function verifyCachedBinary(
  binaryPath: string,
  options?:
    | { integrity?: string | undefined; sha256?: string | undefined }
    | undefined,
): Promise<BinaryFileDigests> {
  const opts = { __proto__: null, ...options } as {
    integrity?: string | undefined
    sha256?: string | undefined
  }
  const digests = await hashBinaryFile(binaryPath)
  const mismatch = (label: string, want: string, got: string): Error => {
    return new ErrorCtor(
      `${label} mismatch for cached binary: expected ${want}, got ${got}. Where: ${binaryPath}. Fix: the cache entry was deleted, so retry to fetch a fresh copy.`,
    )
  }
  if (opts.integrity && digests.integrity !== opts.integrity) {
    await safeDelete(binaryPath)
    throw mismatch('Integrity', opts.integrity, digests.integrity)
  }
  if (opts.sha256 && digests.sha256 !== opts.sha256.toLowerCase()) {
    await safeDelete(binaryPath)
    throw mismatch('SHA-256', opts.sha256, digests.sha256)
  }
  return digests
}
