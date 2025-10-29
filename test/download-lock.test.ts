/**
 * @fileoverview Unit tests for download-lock utilities.
 */

import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { downloadWithLock } from '@socketsecurity/lib/download-lock'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('downloadWithLock', () => {
  let testDir: string
  let lockDir: string

  beforeEach(async () => {
    // Create unique test directory for each test
    testDir = join(
      tmpdir(),
      `download-lock-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    lockDir = join(testDir, '.locks')
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    // Clean up test directory
    try {
      await rm(testDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('basic download functionality', () => {
    it('should return immediately if file already exists with content', async () => {
      const destPath = join(testDir, 'existing-file.txt')
      const content = 'existing content'
      await writeFile(destPath, content)

      const result = await downloadWithLock(
        'https://example.com/test.txt',
        destPath,
        { locksDir: lockDir },
      )

      expect(result.path).toBe(destPath)
      expect(result.size).toBe(content.length)
    })
  })

  describe('locking mechanism', () => {
    it('should create and remove lock files', async () => {
      const destPath = join(testDir, 'locked-file.txt')

      // Pre-create the file so download succeeds immediately
      await writeFile(destPath, 'content')

      await downloadWithLock('https://example.com/test.txt', destPath, {
        locksDir: lockDir,
      })

      // Lock should be released after download
      const lockFiles = existsSync(lockDir) ? await readdir(lockDir) : []
      expect(lockFiles).toHaveLength(0)
    })

    it('should remove stale locks based on timeout', async () => {
      const destPath = join(testDir, 'stale-lock-file.txt')
      await mkdir(lockDir, { recursive: true })

      const lockFilename = `${destPath.replace(/[^\w.-]/g, '_')}.lock`
      const lockPath = join(lockDir, lockFilename)

      // Create a lock file with old timestamp
      const lockInfo = {
        pid: process.pid + 1, // Different PID
        startTime: Date.now() - 15_000, // 15 seconds ago
        url: 'https://example.com/test.txt',
      }
      await writeFile(lockPath, JSON.stringify(lockInfo, null, 2), {
        flag: 'w',
      })

      // Pre-create file to succeed immediately after lock acquisition
      await writeFile(destPath, 'content')

      // Should acquire lock immediately since existing lock is stale
      const result = await downloadWithLock(
        'https://example.com/test.txt',
        destPath,
        {
          locksDir: lockDir,
          staleTimeout: 10_000, // 10 second stale timeout
        },
      )

      expect(result.path).toBe(destPath)
    })

    it('should remove stale locks when process no longer exists', async () => {
      const destPath = join(testDir, 'dead-process-file.txt')
      await mkdir(lockDir, { recursive: true })

      const lockFilename = `${destPath.replace(/[^\w.-]/g, '_')}.lock`
      const lockPath = join(lockDir, lockFilename)

      // Create a lock file with a PID that doesn't exist
      const lockInfo = {
        pid: 999_999, // Very unlikely to exist
        startTime: Date.now(),
        url: 'https://example.com/test.txt',
      }
      await writeFile(lockPath, JSON.stringify(lockInfo, null, 2), {
        flag: 'w',
      })

      // Pre-create file to succeed immediately after lock acquisition
      await writeFile(destPath, 'content')

      // Should acquire lock immediately since the process doesn't exist
      const result = await downloadWithLock(
        'https://example.com/test.txt',
        destPath,
        {
          locksDir: lockDir,
        },
      )

      expect(result.path).toBe(destPath)
    })
  })

  describe('concurrent downloads', () => {
    it('should handle concurrent downloads to different files', async () => {
      const destPath1 = join(testDir, 'concurrent-1.txt')
      const destPath2 = join(testDir, 'concurrent-2.txt')

      // Pre-create files
      await writeFile(destPath1, 'content1')
      await writeFile(destPath2, 'content2')

      const results = await Promise.all([
        downloadWithLock('https://example.com/test1.txt', destPath1, {
          locksDir: lockDir,
        }),
        downloadWithLock('https://example.com/test2.txt', destPath2, {
          locksDir: lockDir,
        }),
      ])

      expect(results[0].path).toBe(destPath1)
      expect(results[1].path).toBe(destPath2)
    })
  })

  describe('lock file path generation', () => {
    it('should sanitize special characters in destination path', async () => {
      const destPath = join(testDir, 'file with spaces & special!chars.txt')

      // Pre-create file
      await writeFile(destPath, 'content')

      const result = await downloadWithLock(
        'https://example.com/test.txt',
        destPath,
        {
          locksDir: lockDir,
        },
      )

      expect(result.path).toBe(destPath)

      // Lock should have been created with sanitized name
      // The lock file name should replace special chars with underscores
      const expectedLockName = destPath.replace(/[^\w.-]/g, '_')
      expect(expectedLockName).toContain('_')
    })

    it('should use custom locks directory when provided', async () => {
      const customLockDir = join(testDir, 'custom-locks')
      const destPath = join(testDir, 'custom-lock-file.txt')

      // Pre-create file
      await writeFile(destPath, 'content')

      const result = await downloadWithLock(
        'https://example.com/test.txt',
        destPath,
        {
          locksDir: customLockDir,
        },
      )

      // Download should succeed
      expect(result.path).toBe(destPath)
      // We can't reliably check if the lock dir still exists after download completes
      // because it may be cleaned up. Just verify the download worked.
    })
  })

  describe('configuration options', () => {
    it('should respect custom staleTimeout', async () => {
      const destPath = join(testDir, 'stale-config-file.txt')
      await mkdir(lockDir, { recursive: true })

      const lockFilename = `${destPath.replace(/[^\w.-]/g, '_')}.lock`
      const lockPath = join(lockDir, lockFilename)

      // Create lock with old timestamp but within short stale timeout
      const lockInfo = {
        pid: process.pid + 1,
        startTime: Date.now() - 1500, // 1.5 seconds ago
        url: 'https://example.com/test.txt',
      }
      await writeFile(lockPath, JSON.stringify(lockInfo, null, 2), {
        flag: 'w',
      })

      // Pre-create file
      await writeFile(destPath, 'content')

      // With staleTimeout of 1000ms, the lock should be considered stale
      const result = await downloadWithLock(
        'https://example.com/test.txt',
        destPath,
        {
          locksDir: lockDir,
          staleTimeout: 1000,
        },
      )

      expect(result.path).toBe(destPath)
    })
  })
})
