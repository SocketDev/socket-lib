/**
 * @file On-disk cache metadata helpers for dlx binaries.
 *
 *   - `getDlxCachePath` — root of the binary cache (alias of getSocketDlxDir)
 *   - `getBinaryCacheMetadataPath` — path to a cache entry's .dlx-metadata.json
 *   - `isBinaryCacheValid` — TTL-based liveness check
 *   - `writeBinaryCacheMetadata` — atomic write of cache metadata
 *   - `cleanDlxCache` — TTL-based eviction sweep
 *   - `listDlxCache` — enumerate cached binaries with their metadata Split out of
 *     `dlx/binary.ts` for size hygiene.
 */

/* oxlint-disable socket/prefer-exists-sync -- DLX binary metadata uses stat for size/mtime; not existence-only checks. */

import process from 'node:process'
import { existsSync } from 'node:fs'

import { DLX_BINARY_CACHE_TTL } from '../constants/time'
import { readJson } from '../fs/read-json'
import { safeDelete } from '../fs/safe'
import { isPlainObject } from '../objects/predicates'
import { getSocketDlxDir } from '../paths/socket'

import { ArrayIsArray, ArrayPrototypeFind } from '../primordials/array'

import { DateNow } from '../primordials/date'

import { JSONStringify } from '../primordials/json'

import { StringPrototypeStartsWith } from '../primordials/string'

import { getNodeFs } from '../node/fs'
import { getNodePath } from '../node/path'

import type { DlxMetadata } from './binary-types'

/**
 * Clean expired entries from the DLX cache.
 *
 * @example
 *   ;```typescript
 *   // Remove cache entries older than the default TTL
 *   const removed = await cleanDlxCache()
 *
 *   // Remove entries older than 1 hour
 *   const removed2 = await cleanDlxCache(60 * 60 * 1000)
 *   ```
 */
export async function cleanDlxCache(
  maxAge: number = DLX_BINARY_CACHE_TTL,
): Promise<number> {
  const cacheDir = getDlxCachePath()
  const fs = getNodeFs()

  if (!fs.existsSync(cacheDir)) {
    return 0
  }

  let cleaned = 0
  const now = DateNow()
  const path = getNodePath()
  const entries = await fs.promises.readdir(cacheDir)

  for (const entry of entries) {
    const entryPath = path.join(cacheDir, entry)
    const metaPath = getBinaryCacheMetadataPath(entryPath)

    try {
      // eslint-disable-next-line no-await-in-loop
      if (!(await existsSync(entryPath))) {
        continue
      }

      // eslint-disable-next-line no-await-in-loop
      const metadata = await readJson(metaPath, { throws: false })
      if (!metadata || typeof metadata !== 'object' || ArrayIsArray(metadata)) {
        continue
      }
      const timestamp = (metadata as Record<string, unknown>)['timestamp']
      // If timestamp is missing or invalid, treat as expired (age = infinity)
      const age =
        typeof timestamp === 'number' && timestamp > 0
          ? now - timestamp
          : Number.POSITIVE_INFINITY

      // Treat future timestamps (clock skew) as expired
      if (age < 0 || age > maxAge) {
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
 * Get metadata file path for a cached binary.
 *
 * @example
 *   ;```typescript
 *   const metaPath = getBinaryCacheMetadataPath('/tmp/dlx-cache/a1b2c3d4')
 *   // '/tmp/dlx-cache/a1b2c3d4/.dlx-metadata.json'
 *   ```
 */
export function getBinaryCacheMetadataPath(cacheEntryPath: string): string {
  return getNodePath().join(cacheEntryPath, '.dlx-metadata.json')
}

/**
 * Get the DLX binary cache directory path. Alias of `getSocketDlxDir` — DLX
 * binary cache uses the same directory as dlx-package for unified DLX storage.
 *
 * @example
 *   ;```typescript
 *   const cachePath = getDlxCachePath()
 *   ```
 */
export const getDlxCachePath = getSocketDlxDir

/**
 * Check if a cached binary is still valid.
 *
 * @example
 *   ;```typescript
 *   const ttl = 7 * 24 * 60 * 60 * 1000
 *   const valid = await isBinaryCacheValid('/tmp/dlx-cache/a1b2c3d4', ttl)
 *   if (!valid) {
 *     // Re-download the binary
 *   }
 *   ```
 */
export async function isBinaryCacheValid(
  cacheEntryPath: string,
  cacheTtl: number,
): Promise<boolean> {
  const fs = getNodeFs()
  try {
    const metaPath = getBinaryCacheMetadataPath(cacheEntryPath)
    if (!fs.existsSync(metaPath)) {
      return false
    }

    const metadata = await readJson(metaPath, { throws: false })
    if (!isPlainObject(metadata)) {
      return false
    }
    const now = DateNow()
    const timestamp = (metadata as Record<string, unknown>)['timestamp']
    // If timestamp is missing or invalid, cache is invalid
    if (typeof timestamp !== 'number' || timestamp <= 0) {
      return false
    }
    const age = now - timestamp
    // Reject future timestamps (clock skew or corruption)
    if (age < 0) {
      return false
    }
    return age < cacheTtl
  } catch {
    return false
  }
}

/**
 * Get information about cached binaries.
 *
 * @example
 *   ```typescript
 *   const entries = await listDlxCache()
 *   for (const entry of entries) {
 *   console.log(`${entry.name}: ${entry.size} bytes`)
 *   }
 *   ```
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
  const fs = getNodeFs()

  if (!fs.existsSync(cacheDir)) {
    return []
  }

  const results = []
  const now = DateNow()
  const path = getNodePath()
  const entries = await fs.promises.readdir(cacheDir)

  for (const entry of entries) {
    const entryPath = path.join(cacheDir, entry)
    try {
      // eslint-disable-next-line no-await-in-loop
      if (!(await existsSync(entryPath))) {
        continue
      }

      const metaPath = getBinaryCacheMetadataPath(entryPath)
      // eslint-disable-next-line no-await-in-loop
      const metadata = await readJson(metaPath, { throws: false })
      if (!metadata || typeof metadata !== 'object' || ArrayIsArray(metadata)) {
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
      const binaryFile = ArrayPrototypeFind(
        files,
        f => !StringPrototypeStartsWith(f, '.'),
      )

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

/**
 * Read the DlxMetadata for a cached binary. Returns `undefined` when the
 * metadata file is missing, unreadable, or doesn't match the expected shape.
 * Useful for callers that want to recover the integrity / size / source URL of
 * an already-cached download without re-fetching.
 *
 * @example
 *   ```typescript
 *   const meta = await readBinaryCacheMetadata(cacheEntryDir)
 *   if (meta) {
 *   console.log(`Pinned integrity: ${meta.integrity}`)
 *   }
 *   ```
 */
export async function readBinaryCacheMetadata(
  cacheEntryPath: string,
): Promise<DlxMetadata | undefined> {
  const fs = getNodeFs()
  try {
    const metaPath = getBinaryCacheMetadataPath(cacheEntryPath)
    if (!fs.existsSync(metaPath)) {
      return undefined
    }
    const metadata = await readJson(metaPath, { throws: false })
    if (!isPlainObject(metadata)) {
      return undefined
    }
    return metadata as unknown as DlxMetadata
  } catch {
    return undefined
  }
}

/**
 * Write metadata for a cached binary. Uses unified schema shared with C++
 * decompressor and CLI dlxBinary.
 *
 * @example
 *   ;```typescript
 *   await writeBinaryCacheMetadata(
 *     '/tmp/dlx-cache/a1b2c3d4',
 *     'a1b2c3d4',
 *     'https://example.com/tool',
 *     'sha512-abc123...',
 *     15000000,
 *   )
 *   ```
 */
export async function writeBinaryCacheMetadata(
  cacheEntryPath: string,
  cacheKey: string,
  url: string,
  integrity: string,
  size: number,
): Promise<void> {
  const metaPath = getBinaryCacheMetadataPath(cacheEntryPath)
  const metadata: DlxMetadata = {
    version: '1.0.0',
    cache_key: cacheKey,
    timestamp: DateNow(),
    integrity,
    size,
    source: {
      type: 'download',
      url,
    },
  }
  const fs = getNodeFs()
  // Use atomic write-then-rename pattern to prevent corruption on crash
  const tmpPath = `${metaPath}.tmp.${process.pid}`
  await fs.promises.writeFile(tmpPath, JSONStringify(metadata, null, 2))
  await fs.promises.rename(tmpPath, metaPath)
}
