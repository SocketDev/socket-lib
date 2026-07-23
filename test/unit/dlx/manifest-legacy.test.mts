/**
 * @file Unit tests for the DlxManifest legacy-format and utility surface.
 *   Exercises the on-disk manifest behavior for dlx (download and execute)
 *   cached packages:
 *
 *   - get / set legacy-format records
 *   - clear (single entry)
 *   - isFresh TTL checks
 *   - getAllPackages (legacy + new format keys) The new-format entry API
 *     (getManifestEntry / setPackageEntry / setBinaryEntry / clearAll) lives in
 *     manifest-class.test.mts. The pure type guards (isPackageEntry /
 *     isBinaryEntry) live in manifest.test.mts.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DlxManifest } from '../../../src/dlx/manifest'
import type { PackageDetails, StoreRecord } from '../../../src/dlx/manifest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { safeDelete } from '@socketsecurity/lib-stable/fs/safe'

describe.sequential('DlxManifest legacy', () => {
  let testDir: string
  let manifestPath: string
  let manifest: DlxManifest

  beforeEach(async () => {
    // Create unique temp directory for each test
    testDir = path.join(
      os.tmpdir(),
      `dlx-manifest-legacy-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    mkdirSync(testDir, { recursive: true })
    manifestPath = path.join(testDir, '.dlx-manifest.json')
    manifest = new DlxManifest({ manifestPath })
  })

  afterEach(async () => {
    // Clean up test directory
    try {
      if (existsSync(testDir)) {
        await safeDelete(testDir)
      }
    } catch {}
  })

  describe('get (legacy)', () => {
    it('should return undefined for non-existent entry', () => {
      const record = manifest.get('non-existent')
      expect(record).toBeUndefined()
    })

    it('should return legacy format entry', async () => {
      const record: StoreRecord = {
        timestampFetch: Date.now(),
        timestampNotification: Date.now(),
        version: '1.2.3',
      }
      await manifest.set('legacy-pkg', record)

      const retrieved = manifest.get('legacy-pkg')
      expect(retrieved).toBeDefined()
      expect(retrieved?.version).toBe('1.2.3')
    })

    it('should not return new format entries', async () => {
      const details: PackageDetails = { installed_version: '1.0.0' }
      await manifest.setPackageEntry('new-pkg', 'key', details)

      const retrieved = manifest.get('new-pkg')
      expect(retrieved).toBeUndefined()
    })
  })

  describe('set (legacy)', () => {
    it('should store legacy format entry', async () => {
      const record: StoreRecord = {
        timestampFetch: Date.now(),
        timestampNotification: Date.now() - 5000,
        version: '2.3.4',
      }
      await manifest.set('test-pkg', record)

      const retrieved = manifest.get('test-pkg')
      expect(retrieved).toBeDefined()
      expect(retrieved?.version).toBe('2.3.4')
    })

    it('should update existing legacy entry', async () => {
      const record1: StoreRecord = {
        timestampFetch: 1000,
        timestampNotification: 1000,
        version: '1.0.0',
      }
      await manifest.set('pkg', record1)

      const record2: StoreRecord = {
        timestampFetch: 2000,
        timestampNotification: 2000,
        version: '2.0.0',
      }
      await manifest.set('pkg', record2)

      const retrieved = manifest.get('pkg')
      expect(retrieved?.version).toBe('2.0.0')
      expect(retrieved?.timestampFetch).toBe(2000)
    })

    it('should handle missing manifest file', async () => {
      const record: StoreRecord = {
        timestampFetch: Date.now(),
        timestampNotification: Date.now(),
        version: '1.0.0',
      }
      await manifest.set('new-pkg', record)

      expect(existsSync(manifestPath)).toBe(true)
    })
  })

  describe('clear', () => {
    it('should remove specific entry', async () => {
      const record: StoreRecord = {
        timestampFetch: Date.now(),
        timestampNotification: Date.now(),
        version: '1.0.0',
      }
      await manifest.set('pkg-to-clear', record)
      expect(manifest.get('pkg-to-clear')).toBeDefined()

      await manifest.clear('pkg-to-clear')
      expect(manifest.get('pkg-to-clear')).toBeUndefined()
    })

    it('should not throw when clearing non-existent entry', async () => {
      await expect(manifest.clear('non-existent')).resolves.not.toThrow()
    })

    it('should not throw when manifest file does not exist', async () => {
      await expect(manifest.clear('anything')).resolves.not.toThrow()
    })

    it('should not affect other entries', async () => {
      const record1: StoreRecord = {
        timestampFetch: Date.now(),
        timestampNotification: Date.now(),
        version: '1.0.0',
      }
      const record2: StoreRecord = {
        timestampFetch: Date.now(),
        timestampNotification: Date.now(),
        version: '2.0.0',
      }
      await manifest.set('pkg1', record1)
      await manifest.set('pkg2', record2)

      await manifest.clear('pkg1')

      expect(manifest.get('pkg1')).toBeUndefined()
      expect(manifest.get('pkg2')).toBeDefined()
    })
  })

  describe('isFresh', () => {
    it('should return false for undefined record', () => {
      expect(manifest.isFresh(undefined, 10_000)).toBe(false)
    })

    it('should return true for fresh record', () => {
      const record: StoreRecord = {
        timestampFetch: Date.now(),
        timestampNotification: Date.now(),
        version: '1.0.0',
      }
      expect(manifest.isFresh(record, 10_000)).toBe(true)
    })

    it('should return false for stale record', () => {
      const record: StoreRecord = {
        timestampFetch: Date.now() - 20_000,
        timestampNotification: Date.now(),
        version: '1.0.0',
      }
      expect(manifest.isFresh(record, 10_000)).toBe(false)
    })

    it('should handle edge case at TTL boundary', () => {
      const ttl = 5000
      const record: StoreRecord = {
        timestampFetch: Date.now() - ttl,
        timestampNotification: Date.now(),
        version: '1.0.0',
      }
      // At exact boundary, should be stale
      expect(manifest.isFresh(record, ttl)).toBe(false)
    })

    it('should handle zero TTL', () => {
      const record: StoreRecord = {
        timestampFetch: Date.now(),
        timestampNotification: Date.now(),
        version: '1.0.0',
      }
      expect(manifest.isFresh(record, 0)).toBe(false)
    })
  })

  describe('getAllPackages', () => {
    it('should return empty array when manifest does not exist', () => {
      const packages = manifest.getAllPackages()
      expect(packages).toEqual([])
    })

    it('should return empty array for empty manifest', () => {
      writeFileSync(manifestPath, '{}', 'utf8')
      const packages = manifest.getAllPackages()
      expect(packages).toEqual([])
    })

    it('should return all package keys', async () => {
      const record1: StoreRecord = {
        timestampFetch: Date.now(),
        timestampNotification: Date.now(),
        version: '1.0.0',
      }
      const record2: StoreRecord = {
        timestampFetch: Date.now(),
        timestampNotification: Date.now(),
        version: '2.0.0',
      }
      await manifest.set('pkg1', record1)
      await manifest.set('pkg2', record2)

      const packages = manifest.getAllPackages()
      expect(packages).toContain('pkg1')
      expect(packages).toContain('pkg2')
      expect(packages).toHaveLength(2)
    })

    it('should include both legacy and new format entries', async () => {
      const record: StoreRecord = {
        timestampFetch: Date.now(),
        timestampNotification: Date.now(),
        version: '1.0.0',
      }
      await manifest.set('legacy-pkg', record)

      const details: PackageDetails = { installed_version: '2.0.0' }
      await manifest.setPackageEntry('new-pkg', 'key', details)

      const packages = manifest.getAllPackages()
      expect(packages).toContain('legacy-pkg')
      expect(packages).toContain('new-pkg')
    })

    it('should handle corrupted manifest gracefully', () => {
      writeFileSync(manifestPath, 'invalid json{{{', 'utf8')
      const packages = manifest.getAllPackages()
      expect(packages).toEqual([])
    })
  })
})
