/**
 * @file Streaming file downloads with retries, progress callbacks, and SHA-256
 *   verification. `httpDownload` is the public entry — it writes to a
 *   randomly-named sibling temp file first, then atomic-renames into place on
 *   success so a failed run never leaves a half-written file at `destPath`.
 *   `httpDownloadAttempt` is one streaming pass; the retry / hash-check loop
 *   sits in `httpDownload`. `httpDownloadAttempt` is exported (not private) per
 *   `export-top-level-functions` — it lives here next to the only caller, and
 *   it uses `httpRequestAttempt(... { stream: true })` from `request.ts` to
 *   obtain the unconsumed `rawResponse` it pipes to disk.
 */

import { setTimeout as delay } from 'node:timers/promises'

import { safeDelete } from '../fs/safe'
import { BufferFrom } from '../primordials/buffer'
import { ErrorCtor } from '../primordials/error'
import { MathFloor } from '../primordials/math'
import { NumberParseInt } from '../primordials/number'
import { PromiseCtor } from '../primordials/promise'
import { getCrypto, getFs } from './_internal'
import { httpRequestAttempt } from './request'
import { HttpResponseError } from './response-types'

import type { HttpDownloadOptions, HttpDownloadResult } from './download-types'

/**
 * Download a file from a URL to a local path with redirect support, retry
 * logic, and progress callbacks. Uses streaming to avoid loading entire file in
 * memory.
 *
 * The download is streamed directly to disk, making it memory-efficient even
 * for large files. Progress callbacks allow for real-time download status
 * updates.
 *
 * Automatically follows HTTP redirects (3xx status codes) by default, making it
 * suitable for downloading from services like GitHub releases that redirect to
 * CDN URLs.
 *
 * @example
 *   ```ts
 *   // Simple download
 *   const result = await httpDownload(
 *   'https://example.com/file.zip',
 *   '/tmp/file.zip',
 *   )
 *   console.log(`Downloaded ${result.size} bytes to ${result.path}`)
 *
 *   // Download from GitHub releases (handles 302 redirect automatically)
 *   await httpDownload(
 *   'https://github.com/org/repo/releases/download/v1.0.0/binary.tar.gz',
 *   '/tmp/binary.tar.gz',
 *   )
 *
 *   // With progress tracking
 *   await httpDownload('https://example.com/large-file.zip', '/tmp/file.zip', {
 *   onProgress: (downloaded, total) => {
 *   const percent = ((downloaded / total) * 100).toFixed(1)
 *   console.log(`Progress: ${percent}% (${downloaded}/${total} bytes)`)
 *   },
 *   })
 *
 *   // With retries and custom timeout
 *   await httpDownload('https://example.com/file.zip', '/tmp/file.zip', {
 *   retries: 3,
 *   retryDelay: 2000,
 *   timeout: 300000, // 5 minutes
 *   headers: { Authorization: 'Bearer token123' },
 *   })
 *   ```
 *
 * @param url - The URL to download from (must start with http:// or https://)
 * @param destPath - Absolute path where the file should be saved.
 * @param options - Download configuration options.
 *
 * @returns Promise resolving to download result with path and size
 *
 * @throws {Error} When all retries are exhausted, download fails, or file
 *   cannot be written.
 */
export async function httpDownload(
  url: string,
  destPath: string,
  options?: HttpDownloadOptions | undefined,
): Promise<HttpDownloadResult> {
  const {
    ca,
    followRedirects = true,
    headers = {},
    logger,
    maxRedirects = 5,
    onProgress,
    progressInterval = 10,
    retries = 0,
    retryDelay = 1000,
    sha256,
    timeout = 120_000,
  } = { __proto__: null, ...options } as HttpDownloadOptions

  // Progress callback wiring; both arms (onProgress passed, logger
  // passed) and the inner total===0 + interval-throttle branches fire
  // only on real network downloads, not the unit test mocks.
  /* c8 ignore start */
  let progressCallback:
    | ((downloaded: number, total: number) => void)
    | undefined
  if (onProgress) {
    progressCallback = onProgress
  } else if (logger) {
    let lastPercent = 0
    progressCallback = (downloaded: number, total: number) => {
      const percent = total === 0 ? 0 : MathFloor((downloaded / total) * 100)
      if (percent >= lastPercent + progressInterval) {
        logger.log(
          `  Progress: ${percent}% (${(downloaded / 1024 / 1024).toFixed(1)} MB / ${(total / 1024 / 1024).toFixed(1)} MB)`,
        )
        lastPercent = percent
      }
    }
  }
  /* c8 ignore stop */

  // Download to a temp file first, then atomically rename to destination.
  // This prevents partial/corrupted files at the destination path if download fails,
  // and preserves the original file (if any) until download succeeds.
  const crypto = getCrypto()
  const fs = getFs()
  const tempSuffix = crypto.randomBytes(6).toString('hex')
  const tempPath = `${destPath}.${tempSuffix}.download`

  // Clean up any stale temp file from a previous failed download.
  if (fs.existsSync(tempPath)) {
    await safeDelete(tempPath)
  }

  // Retry logic with exponential backoff
  let lastError: Error | undefined
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await httpDownloadAttempt(url, tempPath, {
        ca,
        followRedirects,
        headers,
        maxRedirects,
        onProgress: progressCallback,
        timeout,
      })

      // Verify checksum if sha256 hash is provided.
      if (sha256) {
        const fileContent = await fs.promises.readFile(tempPath)
        const computedHash = crypto
          .createHash('sha256')
          .update(fileContent)
          .digest('hex')

        const expectedHash = sha256.toLowerCase()

        // Use constant-time comparison to prevent timing attacks.
        if (
          computedHash.length !== expectedHash.length ||
          !crypto.timingSafeEqual(
            BufferFrom!(computedHash),
            Buffer.from(expectedHash),
          )
        ) {
          await safeDelete(tempPath)
          throw new ErrorCtor(
            `Checksum verification failed for ${url}\n` +
              `Expected: ${expectedHash}\n` +
              `Computed: ${computedHash}`,
          )
        }
      }

      // Download succeeded - atomically rename temp file to destination.
      // This overwrites any existing file at destPath.
      await fs.promises.rename(tempPath, destPath)

      return {
        ...result,
        path: destPath,
      }
    } catch (e) {
      lastError = e as Error

      // Clean up failed temp file before retry.
      if (fs.existsSync(tempPath)) {
        await safeDelete(tempPath)
      }

      // Last attempt - throw error
      if (attempt === retries) {
        break
      }

      // Retry with exponential backoff
      const delayMs = retryDelay * 2 ** attempt
      await delay(delayMs)
    }
  }

  throw lastError || new ErrorCtor('Download failed after retries')
}

/**
 * Single download attempt using httpRequestAttempt with stream: true.
 */
export async function httpDownloadAttempt(
  url: string,
  destPath: string,
  options: HttpDownloadOptions,
): Promise<HttpDownloadResult> {
  const {
    ca,
    followRedirects = true,
    headers = {},
    maxRedirects = 5,
    onProgress,
    timeout = 120_000,
  } = { __proto__: null, ...options } as HttpDownloadOptions

  const response = await httpRequestAttempt(url, {
    ca,
    followRedirects,
    headers,
    maxRedirects,
    method: 'GET',
    stream: true,
    timeout,
  })

  if (!response.ok) {
    throw new HttpResponseError(
      response,
      `Download failed: HTTP ${response.status} ${response.statusText}`,
    )
  }

  const res = response.rawResponse
  // Defensive: rawResponse is always present after streaming response.
  /* c8 ignore next 3 */
  if (!res) {
    throw new ErrorCtor('Stream response missing rawResponse')
  }

  const { createWriteStream } = getFs()
  const totalSize = NumberParseInt(
    (response.headers['content-length'] as string) || '0',
    10,
  )

  return await new PromiseCtor((resolve, reject) => {
    let downloadedSize = 0
    const fileStream = createWriteStream(destPath)

    const cleanupPartial = () => {
      // Fire-and-forget: caller doesn't await. The async IIFE keeps
      // the safeDelete+swallow in async/await form rather than chaining
      // .catch on a dangling promise. safeDelete tolerates ENOENT and
      // retries on EBUSY, which the previous fs.unlink did not.
      ;(async () => {
        try {
          await safeDelete(destPath)
        } catch {
          // Swallow — partial-file may be gone, perms may be off; we
          // don't care, this is best-effort cleanup.
        }
      })()
    }

    fileStream.on('error', (error: Error) => {
      // `.pipe()` never tears down the SOURCE when the destination errors
      // (only stream.pipeline does) — without this, a disk-write failure
      // (ENOSPC, EACCES) leaves the response socket streaming into a dead
      // pipe until the server hangs up.
      res.unpipe(fileStream)
      res.destroy()
      fileStream.destroy()
      cleanupPartial()
      reject(
        new ErrorCtor(`Failed to write file: ${error.message}`, {
          cause: error,
        }),
      )
    })

    res.on('data', (chunk: Buffer) => {
      downloadedSize += chunk.length
      if (onProgress && totalSize > 0) {
        onProgress(downloadedSize, totalSize)
      }
    })

    // Settle on `fileStream` 'finish', NOT `res` 'end'. `res.pipe`
    // calls `fileStream.end()` on res-end, but the buffered writes
    // may still be draining to disk when that happens. `'finish'`
    // fires after the final write callback completes — that's the
    // correct settle point. Resolving on `res.end` can return a
    // truncated file when the network is fast and the disk is slow
    // (or backpressure builds on `fileStream.write`).
    fileStream.on('finish', () => {
      resolve({
        headers: response.headers,
        ok: true,
        path: destPath,
        size: downloadedSize,
        status: response.status,
        statusText: response.statusText,
      })
    })

    res.on('error', (error: Error) => {
      fileStream.destroy()
      cleanupPartial()
      reject(error)
    })

    res.pipe(fileStream)
  })
}
