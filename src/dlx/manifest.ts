/**
 * @file DLX manifest storage utilities. Manages persistent caching of DLX
 *   package and binary metadata with TTL support and atomic file operations.
 *   Primary API (on {@link DlxManifest}):
 *
 *   - `getManifestEntry(spec)` — retrieve a manifest entry by spec
 *   - `setPackageEntry(spec, key, details)` — store npm package metadata
 *   - `setBinaryEntry(spec, key, details)` — store binary download metadata
 *   - `getAllPackages()` — enumerate cached package names
 *   - `clear(name)` / `clearAll()` — eviction Features:
 *   - Atomic file operations with locking
 *   - JSON-based persistent storage
 *   - Error-resistant implementation Storage Format:
 *   - Stores in ~/.socket/_dlx/.dlx-manifest.json
 *   - Per-spec manifest entries with timestamps
 *   - Thread-safe operations using process lock utility Usage:
 *   - Update check caching
 *   - Binary metadata tracking
 *   - Rate limiting registry requests
 */

import { errorMessage } from '../errors/message'
import { readFileUtf8Sync } from '../fs/read-file'
import { safeDeleteSync, safeMkdirSync } from '../fs/safe'
import { getDefaultLogger } from '../logger/default'
import { getSocketDlxDir } from '../paths/socket'
import { processLock } from '../process/lock-instance'

import { JSONParse, JSONStringify } from '../primordials/json'

import { ObjectKeys } from '../primordials/object'

import { getNodeFs } from '../node/fs'
import { getNodePath } from '../node/path'

const fs = getNodeFs()
const path = getNodePath()
const logger = getDefaultLogger()

/**
 * Manifest file name.
 */
const MANIFEST_FILE_NAME = '.dlx-manifest.json'

/**
 * Details for npm package entries.
 */
export interface PackageDetails {
  installed_version: string
  size?: number | undefined
  update_check?:
    | {
        last_check: number
        last_notification: number
        latest_known: string
      }
    | undefined
}
/**
 * Details for binary download entries.
 */
export interface BinaryDetails {
  /**
   * SRI integrity hash (sha512-<base64>, aligned with npm).
   */
  integrity: string
  platform: string
  arch: string
  size: number
  source: {
    type: 'download' | 'extract'
    url?: string | undefined
    path?: string | undefined
  }
  /**
   * Update check metadata, using the same structure as packages.
   */
  update_check?:
    | {
        last_check: number
        last_notification: number
        latest_known: string
      }
    | undefined
}

/**
 * Unified manifest entry for every cached package and binary. Shared fields at
 * root, type-specific fields in details.
 */
export interface DlxManifestEntry {
  type: 'package' | 'binary'
  cache_key: string
  timestamp: number
  details: PackageDetails | BinaryDetails
}
export interface DlxManifestOptions {
  /**
   * Custom manifest file path (defaults to ~/.socket/_dlx/.dlx-manifest.json).
   */
  manifestPath?: string | undefined
}

/**
 * Type guard for binary entries.
 *
 * @example
 *   ;```typescript
 *   const entry = manifest.getManifestEntry('https://example.com/tool')
 *   if (entry && isBinaryEntry(entry)) {
 *     console.log(entry.details.integrity)
 *   }
 *   ```
 */
export function isBinaryEntry(
  entry: DlxManifestEntry,
): entry is DlxManifestEntry & { details: BinaryDetails } {
  return entry.type === 'binary'
}

/**
 * Type guard for package entries.
 *
 * @example
 *   ;```typescript
 *   const entry = manifest.getManifestEntry('@socketsecurity/cli@^2.0.0')
 *   if (entry && isPackageEntry(entry)) {
 *     console.log(entry.details.installed_version)
 *   }
 *   ```
 */
export function isPackageEntry(
  entry: DlxManifestEntry,
): entry is DlxManifestEntry & { details: PackageDetails } {
  return entry.type === 'package'
}

/**
 * DLX manifest storage manager with atomic operations, keyed by spec. Skips
 * any on-disk entry that doesn't match the {@link DlxManifestEntry} shape
 * (no `type` field) instead of throwing, so a manifest file is never
 * corrupted beyond repair by one malformed entry.
 */
export class DlxManifest {
  private readonly manifestPath: string
  private readonly lockPath: string

  constructor(options?: DlxManifestOptions | undefined) {
    const { manifestPath } = {
      __proto__: null,
      ...options,
    } as DlxManifestOptions
    this.manifestPath =
      manifestPath ?? path.join(getSocketDlxDir(), MANIFEST_FILE_NAME)
    this.lockPath = `${this.manifestPath}.lock`
  }

  /**
   * Read the entire manifest file.
   *
   * @private
   */
  private readManifest(): Record<
    string,
    DlxManifestEntry | Record<string, unknown>
  > {
    try {
      if (!fs.existsSync(this.manifestPath)) {
        return { __proto__: null } as unknown as Record<
          string,
          DlxManifestEntry | Record<string, unknown>
        >
      }

      const rawContent = readFileUtf8Sync(this.manifestPath)
      const content = (
        typeof rawContent === 'string'
          ? rawContent
          : /* c8 ignore next - readFileUtf8Sync returns string in tests; Buffer fallback. */
            rawContent.toString('utf8')
      ).trim()

      if (!content) {
        return { __proto__: null } as unknown as Record<
          string,
          DlxManifestEntry | Record<string, unknown>
        >
      }

      return JSONParse(content) as Record<
        string,
        DlxManifestEntry | Record<string, unknown>
      >
    } catch (e) {
      logger.warn(`Failed to read manifest: ${errorMessage(e)}`)
      return { __proto__: null } as unknown as Record<
        string,
        DlxManifestEntry | Record<string, unknown>
      >
    }
  }

  /**
   * Write the manifest file atomically.
   *
   * @private
   */
  private async writeManifest(
    data: Record<string, DlxManifestEntry | Record<string, unknown>>,
  ): Promise<void> {
    // Ensure directory exists.
    const manifestDir = path.dirname(this.manifestPath)
    try {
      safeMkdirSync(manifestDir, { recursive: true })
      /* c8 ignore start - safeMkdirSync with recursive:true rarely throws;
         defensive log path for permission-error / EACCES edge cases. */
    } catch (e) {
      logger.warn(`Failed to create manifest directory: ${errorMessage(e)}`)
    }
    /* c8 ignore stop */

    // Write atomically.
    const content = JSONStringify(data, undefined, 2)
    const tempPath = `${this.manifestPath}.tmp`

    try {
      fs.writeFileSync(tempPath, content, 'utf8')
      fs.renameSync(tempPath, this.manifestPath)
      // Cleanup-after-error block fires only when writeFile/renameSync
      // throws; tests don't simulate disk-full or perm errors.
      /* c8 ignore start */
    } catch (e) {
      try {
        if (fs.existsSync(tempPath)) {
          safeDeleteSync(tempPath)
        }
      } catch {}
      throw e
    }
    /* c8 ignore stop */
  }

  /**
   * Clear cached data for a specific entry.
   */
  async clear(name: string): Promise<void> {
    await processLock.withLock(this.lockPath, async () => {
      try {
        if (!fs.existsSync(this.manifestPath)) {
          return
        }

        const content = fs.readFileSync(this.manifestPath, 'utf8')
        if (!content.trim()) {
          return
        }

        const data = JSONParse(content) as Record<
          string,
          DlxManifestEntry | Record<string, unknown>
        >
        delete data[name]

        await this.writeManifest(data)
        /* c8 ignore start - readJson/writeManifest catch; only fires on
           corrupted manifest or filesystem permission errors. */
      } catch (e) {
        logger.warn(`Failed to clear cache for ${name}: ${errorMessage(e)}`)
      }
      /* c8 ignore stop */
    })
  }

  /**
   * Clear all cached data.
   */
  async clearAll(): Promise<void> {
    await processLock.withLock(this.lockPath, async () => {
      try {
        if (fs.existsSync(this.manifestPath)) {
          safeDeleteSync(this.manifestPath)
        }
      } catch (e) {
        logger.warn(`Failed to clear all cache: ${errorMessage(e)}`)
      }
    })
  }

  /**
   * Get all cached package names.
   */
  getAllPackages(): string[] {
    try {
      if (!fs.existsSync(this.manifestPath)) {
        return []
      }

      const rawContent = readFileUtf8Sync(this.manifestPath)
      const content = (
        typeof rawContent === 'string'
          ? rawContent
          : /* c8 ignore next - readFileUtf8Sync returns string in tests; Buffer fallback. */
            rawContent.toString('utf8')
      ).trim()
      if (!content) {
        return []
      }

      const data = JSONParse(content) as Record<string, unknown>
      return ObjectKeys(data)
    } catch (e) {
      logger.warn(`Failed to get package list: ${errorMessage(e)}`)
      return []
    }
  }

  /**
   * Get a manifest entry by spec (e.g., "@socketsecurity/cli@^2.0.11").
   */
  getManifestEntry(spec: string): DlxManifestEntry | undefined {
    const data = this.readManifest()
    const entry = data[spec]

    // Skip anything that doesn't match the DlxManifestEntry shape (no
    // 'type' field) rather than returning malformed data to the caller.
    if (entry && 'type' in entry) {
      return entry as DlxManifestEntry
    }

    return undefined
  }

  /**
   * Set a binary manifest entry.
   */
  async setBinaryEntry(
    spec: string,
    cacheKey: string,
    details: BinaryDetails,
  ): Promise<void> {
    await processLock.withLock(this.lockPath, async () => {
      const data = this.readManifest()

      data[spec] = {
        type: 'binary',
        cache_key: cacheKey,
        timestamp: Date.now(),
        details,
      }

      await this.writeManifest(data)
    })
  }

  /**
   * Set a package manifest entry.
   */
  async setPackageEntry(
    spec: string,
    cacheKey: string,
    details: PackageDetails,
  ): Promise<void> {
    await processLock.withLock(this.lockPath, async () => {
      const data = this.readManifest()

      data[spec] = {
        type: 'package',
        cache_key: cacheKey,
        timestamp: Date.now(),
        details,
      }

      await this.writeManifest(data)
    })
  }
}
// Export singleton instance using default manifest location.
export const dlxManifest = new DlxManifest()
