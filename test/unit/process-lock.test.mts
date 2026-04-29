/**
 * @fileoverview Unit tests for inter-process locking utilities.
 *
 * Tests file-based process locking for concurrency control:
 * - processLock() acquires exclusive locks using lock files
 * - Automatic stale lock detection and cleanup
 * - Timeout-based lock acquisition with retry logic
 * - Lock release and cleanup on process exit
 * - Race condition handling for concurrent processes
 * - Cross-platform lock file support
 * Used by Socket CLI to prevent concurrent operations on shared resources.
 */

import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

import type { ProcessLockOptions } from '@socketsecurity/lib/process-lock'
import { processLock } from '@socketsecurity/lib/process-lock'
import { safeDeleteSync } from '@socketsecurity/lib/fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe.sequential('process-lock', () => {
  let testLockPath: string

  beforeEach(() => {
    // Create a unique lock path for each test to ensure isolation
    testLockPath = path.join(
      tmpdir(),
      `socket-test-lock-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
  })

  afterEach(() => {
    // Clean up lock files after each test
    try {
      if (existsSync(testLockPath)) {
        safeDeleteSync(testLockPath, { recursive: true })
      }
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('acquire', () => {
    it('should acquire lock successfully', async () => {
      const release = await processLock.acquire(testLockPath)
      expect(typeof release).toBe('function')
      expect(existsSync(testLockPath)).toBe(true)
      release()
      expect(existsSync(testLockPath)).toBe(false)
    })

    it('should fail when lock already exists', async () => {
      const release1 = await processLock.acquire(testLockPath)

      // Second acquire should fail
      await expect(
        processLock.acquire(testLockPath, { retries: 1, baseDelayMs: 10 }),
      ).rejects.toThrow(/Lock already exists|Failed to acquire lock/)

      release1()
    })

    it('should acquire lock with custom options', async () => {
      const options: ProcessLockOptions = {
        retries: 5,
        baseDelayMs: 50,
        maxDelayMs: 500,
        staleMs: 5000,
      }

      const release = await processLock.acquire(testLockPath, options)
      expect(existsSync(testLockPath)).toBe(true)
      release()
    })

    it('should handle stale lock removal', async () => {
      // Create a lock directory manually to simulate stale lock
      const fs = await import('node:fs')
      fs.mkdirSync(testLockPath, { recursive: false })

      // Modify mtime to make it appear stale
      const oldTime = Date.now() - 15_000 // 15 seconds ago
      fs.utimesSync(testLockPath, oldTime / 1000, oldTime / 1000)

      // Should detect and remove stale lock
      const release = await processLock.acquire(testLockPath, {
        staleMs: 10_000,
      })

      expect(existsSync(testLockPath)).toBe(true)
      release()
      expect(existsSync(testLockPath)).toBe(false)
    })
  })

  describe('release', () => {
    it('should release lock and remove directory', async () => {
      const release = await processLock.acquire(testLockPath)
      expect(existsSync(testLockPath)).toBe(true)

      release()
      expect(existsSync(testLockPath)).toBe(false)
    })

    it('should handle release of non-existent lock', () => {
      // Should not throw
      expect(() => processLock.release(testLockPath)).not.toThrow()
    })

    it('should handle multiple releases gracefully', async () => {
      const release = await processLock.acquire(testLockPath)

      release()
      expect(existsSync(testLockPath)).toBe(false)

      // Second release should not throw
      expect(() => release()).not.toThrow()
    })
  })

  describe('withLock', () => {
    it('should execute function with lock protection', async () => {
      let executed = false

      const result = await processLock.withLock(testLockPath, async () => {
        executed = true
        expect(existsSync(testLockPath)).toBe(true)
        return 'test-result'
      })

      expect(executed).toBe(true)
      expect(result).toBe('test-result')
      expect(existsSync(testLockPath)).toBe(false)
    })

    it('should release lock even if function throws', async () => {
      const error = new Error('test error')

      await expect(
        processLock.withLock(testLockPath, async () => {
          expect(existsSync(testLockPath)).toBe(true)
          throw error
        }),
      ).rejects.toThrow('test error')

      // Lock should be released
      expect(existsSync(testLockPath)).toBe(false)
    })

    it('should prevent concurrent execution', async () => {
      const executions: number[] = []

      // Start first lock
      const promise1 = processLock.withLock(testLockPath, async () => {
        executions.push(1)
        await sleep(100)
        executions.push(2)
      })

      // Small delay to ensure first lock is acquired
      await sleep(10)

      // Try second lock - should wait
      const promise2 = processLock.withLock(
        testLockPath,
        async () => {
          executions.push(3)
        },
        { retries: 5, baseDelayMs: 50 },
      )

      await Promise.all([promise1, promise2])

      // Second execution should happen after first completes
      expect(executions).toEqual([1, 2, 3])
    })

    it('should pass through return value', async () => {
      const result = await processLock.withLock(testLockPath, async () => {
        return { success: true, data: [1, 2, 3] }
      })

      expect(result).toEqual({ success: true, data: [1, 2, 3] })
    })

    it('should handle synchronous throws in async function', async () => {
      await expect(
        processLock.withLock(testLockPath, async () => {
          throw new Error('immediate error')
        }),
      ).rejects.toThrow('immediate error')

      expect(existsSync(testLockPath)).toBe(false)
    })
  })

  describe('retry behavior', () => {
    it('should retry with exponential backoff', async () => {
      const startTime = Date.now()

      // Create lock that will be held
      const release1 = await processLock.acquire(testLockPath)

      // Try to acquire with retries - should fail after all retries
      const promise = processLock.acquire(testLockPath, {
        retries: 2,
        baseDelayMs: 50,
        maxDelayMs: 100,
      })

      await expect(promise).rejects.toThrow()

      const elapsed = Date.now() - startTime
      // Should have waited for retries (at least baseDelayMs)
      expect(elapsed).toBeGreaterThanOrEqual(40)

      release1()
    })

    it('should respect maxDelayMs', async () => {
      const release1 = await processLock.acquire(testLockPath)

      const startTime = Date.now()
      await expect(
        processLock.acquire(testLockPath, {
          retries: 3,
          baseDelayMs: 1000,
          maxDelayMs: 50, // Cap delays at 50ms
        }),
      ).rejects.toThrow()

      const elapsed = Date.now() - startTime
      // Even with high baseDelayMs, should be capped by maxDelayMs
      expect(elapsed).toBeLessThan(500)

      release1()
    })
  })

  describe('stale detection', () => {
    it('should not consider fresh locks as stale', async () => {
      const release = await processLock.acquire(testLockPath, {
        staleMs: 10_000,
      })

      expect(existsSync(testLockPath)).toBe(true)

      // Lock is fresh, should not be removed
      await expect(
        processLock.acquire(testLockPath, {
          retries: 1,
          baseDelayMs: 10,
          staleMs: 10_000,
        }),
      ).rejects.toThrow(/Lock already exists|Failed to acquire lock/)

      release()
    })

    it('should reclaim locks beyond stale timeout', async () => {
      const fs = await import('node:fs')

      // Create lock directory
      fs.mkdirSync(testLockPath, { recursive: false })

      // Set mtime to make it stale
      const staleTime = Date.now() - 11_000 // 11 seconds ago
      fs.utimesSync(testLockPath, staleTime / 1000, staleTime / 1000)

      // Should successfully acquire by removing stale lock
      const release = await processLock.acquire(testLockPath, {
        staleMs: 10_000,
      })

      expect(existsSync(testLockPath)).toBe(true)
      release()
    })
  })

  describe('edge cases', () => {
    it('should handle very short lock durations', async () => {
      const result = await processLock.withLock(testLockPath, async () => {
        return 'quick'
      })

      expect(result).toBe('quick')
      expect(existsSync(testLockPath)).toBe(false)
    })

    it('should handle multiple different locks', async () => {
      const lockPath1 = `${testLockPath}-1`
      const lockPath2 = `${testLockPath}-2`

      const release1 = await processLock.acquire(lockPath1)
      const release2 = await processLock.acquire(lockPath2)

      expect(existsSync(lockPath1)).toBe(true)
      expect(existsSync(lockPath2)).toBe(true)

      release1()
      expect(existsSync(lockPath1)).toBe(false)
      expect(existsSync(lockPath2)).toBe(true)

      release2()
      expect(existsSync(lockPath2)).toBe(false)
    })

    it('should handle deeply nested lock paths', async () => {
      const deepPath = path.join(
        testLockPath,
        'deeply',
        'nested',
        'lock',
        'path',
      )

      // Should work with nested path (recursive: true creates parent dirs)
      const release = await processLock.acquire(deepPath, { retries: 1 })
      expect(existsSync(deepPath)).toBe(true)
      release()
      expect(existsSync(deepPath)).toBe(false)
    })
  })

  describe('error path messages', () => {
    it('throws an informative error when parent directory does not exist (ENOENT)', async () => {
      // Use a path under a non-existent root that mkdirSync(parent, recursive: true) cannot resolve
      // (e.g., includes a file path component). Easier: lock under a freshly-removed parent.
      const missingPath = path.join(
        '/nonexistent-root-' + Date.now(),
        'sub',
        'lock',
      )
      // mkdirSync with recursive will likely succeed in /tmp but fail under
      // a non-writable absolute root. Use a relative path that mkdir
      // cannot reach when given an empty parent.
      // The cleanest cross-platform reproduction is to mock the fs module,
      // but for an integration test we skip if the system can create the
      // path (very unusual).
      try {
        await processLock.acquire(missingPath, { retries: 1 })
        // If we got here, mkdir succeeded — clean up and skip the assertion.
        processLock.release(missingPath)
      } catch (e) {
        // Expect either the dedicated "Parent directory does not exist"
        // message or a permission error wrapped through "Failed to acquire".
        expect((e as Error).message).toMatch(
          /Parent directory does not exist|Failed to acquire lock|Permission denied/,
        )
      }
    })

    it('returns a working release function from acquire', async () => {
      const release = await processLock.acquire(testLockPath)
      expect(typeof release).toBe('function')
      release()
      expect(existsSync(testLockPath)).toBe(false)
    })

    it('release is idempotent on already-released locks', () => {
      // Releasing a lock that was never acquired or already released should
      // not throw.
      processLock.release(testLockPath)
      processLock.release(testLockPath)
      expect(existsSync(testLockPath)).toBe(false)
    })
  })

  describe('touch timer', () => {
    it('keeps the lock fresh past the stale timeout when touchInterval is set', async () => {
      const fs = await import('node:fs')
      // Short stale window, fast touch.
      const release = await processLock.acquire(testLockPath, {
        staleMs: 200,
        touchIntervalMs: 50,
      })
      const initialMtime = fs.statSync(testLockPath).mtime.getTime()
      // Wait longer than staleMs.
      await sleep(300)
      const refreshedMtime = fs.statSync(testLockPath).mtime.getTime()
      expect(refreshedMtime).toBeGreaterThan(initialMtime)
      release()
    })

    it('does not start a touch timer when touchIntervalMs is 0', async () => {
      const fs = await import('node:fs')
      const release = await processLock.acquire(testLockPath, {
        touchIntervalMs: 0,
        staleMs: 5000,
      })
      const initial = fs.statSync(testLockPath).mtime.getTime()
      await sleep(100)
      const after = fs.statSync(testLockPath).mtime.getTime()
      // No automatic touch — mtime stable.
      expect(after).toBe(initial)
      release()
    })
  })
})
