/**
 * @fileoverview Process locking utilities with stale detection and exit cleanup.
 * Provides cross-platform inter-process synchronization using file-system based locks.
 */

import { existsSync, mkdirSync, statSync } from 'node:fs'

import { safeDeleteSync } from './fs'
import { logger } from './logger'
import { pRetry } from './promises'
import { onExit } from './signal-exit'

/**
 * Lock acquisition options.
 */
export interface ProcessLockOptions {
  /**
   * Maximum number of retry attempts.
   * @default 3
   */
  retries?: number | undefined

  /**
   * Base delay between retries in milliseconds.
   * @default 100
   */
  baseDelayMs?: number | undefined

  /**
   * Maximum delay between retries in milliseconds.
   * @default 1000
   */
  maxDelayMs?: number | undefined

  /**
   * Stale lock timeout in milliseconds.
   * Locks older than this are considered abandoned and can be reclaimed.
   * Aligned with npm's npx locking strategy (5-10 seconds).
   * @default 10000 (10 seconds)
   */
  staleMs?: number | undefined
}

/**
 * Process lock manager with stale detection and exit cleanup.
 * Provides cross-platform inter-process synchronization using file-system
 * based locks.
 */
class ProcessLockManager {
  private activeLocks = new Set<string>()
  private exitHandlerRegistered = false

  /**
   * Ensure process exit handler is registered for cleanup.
   * Registers a handler that cleans up all active locks when the process exits.
   */
  private ensureExitHandler() {
    if (this.exitHandlerRegistered) {
      return
    }

    onExit(() => {
      for (const lockPath of this.activeLocks) {
        try {
          if (existsSync(lockPath)) {
            safeDeleteSync(lockPath, { recursive: true })
          }
        } catch {
          // Ignore cleanup errors during exit
        }
      }
    })

    this.exitHandlerRegistered = true
  }

  /**
   * Check if a lock is stale based on mtime.
   * A lock is considered stale if it's older than the specified timeout,
   * indicating the holding process likely died abnormally.
   *
   * @param lockPath - Path to the lock directory
   * @param staleMs - Stale timeout in milliseconds
   * @returns True if lock exists and is stale
   */
  private isStale(lockPath: string, staleMs: number): boolean {
    try {
      if (!existsSync(lockPath)) {
        return false
      }

      const stats = statSync(lockPath)
      const age = Date.now() - stats.mtime.getTime()
      return age > staleMs
    } catch {
      return false
    }
  }

  /**
   * Acquire a lock using mkdir for atomic operation.
   * Handles stale locks and includes exit cleanup.
   *
   * This method attempts to create a lock directory atomically. If the lock
   * already exists, it checks if it's stale and removes it before retrying.
   * Uses exponential backoff with jitter for retry attempts.
   *
   * @param lockPath - Path to the lock directory
   * @param options - Lock acquisition options
   * @returns Release function to unlock
   * @throws Error if lock cannot be acquired after all retries
   *
   * @example
   * ```typescript
   * const release = await processLock.acquire('/tmp/my-lock')
   * try {
   *   // Critical section
   * } finally {
   *   release()
   * }
   * ```
   */
  async acquire(
    lockPath: string,
    options: ProcessLockOptions = {},
  ): Promise<() => void> {
    const {
      baseDelayMs = 100,
      maxDelayMs = 1000,
      retries = 3,
      staleMs = 10_000,
    } = options

    // Ensure exit handler is registered before any lock acquisition
    this.ensureExitHandler()

    return await pRetry(
      async () => {
        try {
          // Check for stale lock and remove if necessary
          if (existsSync(lockPath) && this.isStale(lockPath, staleMs)) {
            logger.log(`Removing stale lock: ${lockPath}`)
            try {
              safeDeleteSync(lockPath, { recursive: true })
            } catch {
              // Ignore errors removing stale lock - will retry
            }
          }

          // Atomic lock acquisition via mkdir
          mkdirSync(lockPath, { recursive: false })

          // Track lock for cleanup
          this.activeLocks.add(lockPath)

          // Return release function
          return () => this.release(lockPath)
        } catch (error) {
          // Handle lock contention
          if (error instanceof Error && (error as any).code === 'EEXIST') {
            if (this.isStale(lockPath, staleMs)) {
              throw new Error(`Stale lock detected: ${lockPath}`)
            }
            throw new Error(`Lock already exists: ${lockPath}`)
          }
          throw error
        }
      },
      {
        retries,
        baseDelayMs,
        maxDelayMs,
        jitter: true,
      },
    )
  }

  /**
   * Release a lock and remove from tracking.
   * Removes the lock directory and stops tracking it for exit cleanup.
   *
   * @param lockPath - Path to the lock directory
   *
   * @example
   * ```typescript
   * processLock.release('/tmp/my-lock')
   * ```
   */
  release(lockPath: string): void {
    try {
      if (existsSync(lockPath)) {
        safeDeleteSync(lockPath, { recursive: true })
      }
      this.activeLocks.delete(lockPath)
    } catch (error) {
      logger.warn(
        `Failed to release lock ${lockPath}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  /**
   * Execute a function with exclusive lock protection.
   * Automatically handles lock acquisition, execution, and cleanup.
   *
   * This is the recommended way to use process locks, as it guarantees
   * cleanup even if the callback throws an error.
   *
   * @param lockPath - Path to the lock directory
   * @param fn - Function to execute while holding the lock
   * @param options - Lock acquisition options
   * @returns Result of the callback function
   * @throws Error from callback or lock acquisition failure
   *
   * @example
   * ```typescript
   * const result = await processLock.withLock('/tmp/my-lock', async () => {
   *   // Critical section
   *   return someValue
   * })
   * ```
   */
  async withLock<T>(
    lockPath: string,
    fn: () => Promise<T>,
    options?: ProcessLockOptions,
  ): Promise<T> {
    const release = await this.acquire(lockPath, options)
    try {
      return await fn()
    } finally {
      release()
    }
  }
}

// Export singleton instance.
export const processLock = new ProcessLockManager()
