/**
 * @fileoverview `ProcessLockManager` — the class that owns active
 * locks, touch timers, and the exit-handler registration. Provides
 * `acquire` / `release` / `withLock`. Co-located with the touch and
 * staleness helpers because they share private state (`activeLocks`
 * + `touchTimers`).
 *
 * ## Why directories instead of files?
 *
 * This implementation uses `mkdir()` to create lock directories (not files) because:
 *
 * 1. **Atomic guarantee**: `mkdir()` is guaranteed atomic across ALL filesystems,
 *    including NFS. Only ONE process can successfully create the directory. If it
 *    exists, `mkdir()` fails with EEXIST instantly with no race conditions.
 *
 * 2. **File-based locking issues**:
 *    - `writeFile()` with `flag: 'wx'` - atomicity can fail on NFS
 *    - `open()` with `O_EXCL` - not guaranteed atomic on older NFS
 *    - Traditional lockfiles - can have race conditions on network filesystems
 *
 * 3. **Simplicity**: No need to write/read file content, track PIDs, or manage
 *    file descriptors. Just create/delete directory and check mtime.
 *
 * 4. **Historical precedent**: Well-known Unix locking pattern used by package
 *    managers for decades. Git uses similar approach for `.git/index.lock`.
 *
 * ## The mtime trick
 *
 * We periodically update the lock directory's mtime (modification time) by
 * "touching" it to signal "I'm still actively working". This prevents other
 * processes from treating the lock as stale and removing it.
 *
 * **The lock directory remains empty** - it's just a sentinel that signals
 * "locked". The mtime is the only data needed to track lock freshness.
 *
 * ## npm npx compatibility
 *
 * This implementation matches npm npx's concurrency.lock approach:
 * - Lock created via `mkdir(path.join(installDir, 'concurrency.lock'))`
 * - 5-second stale timeout (if mtime is older than 5s, lock is stale)
 * - 2-second touching interval (updates mtime every 2s to keep lock fresh)
 * - Automatic cleanup on process exit
 */

import { errorMessage } from '../errors/message'
import { safeDeleteSync } from '../fs/safe'
import { getDefaultLogger } from '../logger/default'
import { DateNow } from '../primordials/date'
import { ErrorCtor } from '../primordials/error'
import { MapCtor, SetCtor } from '../primordials/map-set'
import { MathMax } from '../primordials/math'
import { pRetry } from '../promises/retry'
import { onExit } from '../signal-exit/register'

import { getFs, getPath } from './_internal'

import type { ProcessLockOptions } from './types'

const logger = getDefaultLogger()

/**
 * Process lock manager with stale detection and exit cleanup.
 * Provides cross-platform inter-process synchronization using file-system
 * based locks.
 */
export class ProcessLockManager {
  private activeLocks = new SetCtor<string>()
  private touchTimers = new MapCtor<string, NodeJS.Timeout>()
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
      /* c8 ignore start - Exit-handler body only fires on real
         process exit. Subprocess test infra would be needed. */
      // Clear all touch timers.
      for (const timer of this.touchTimers.values()) {
        clearInterval(timer)
      }
      this.touchTimers.clear()

      // Clean up all active locks.
      const fs = getFs()
      for (const lockPath of this.activeLocks) {
        try {
          if (fs.existsSync(lockPath)) {
            safeDeleteSync(lockPath, { recursive: true })
          }
        } catch {
          // Ignore cleanup errors during exit.
        }
      }
      /* c8 ignore stop */
    })

    this.exitHandlerRegistered = true
  }

  /**
   * Touch a lock file to update its mtime.
   * This prevents the lock from being detected as stale during long operations.
   *
   * @param lockPath - Path to the lock directory
   */
  private touchLock(lockPath: string): void {
    try {
      const fs = getFs()
      if (fs.existsSync(lockPath)) {
        // utimesSync accepts numeric timestamps (seconds). Pass Date.now() / 1000
        // to avoid the Date allocation on every touch tick.
        const now = DateNow() / 1000
        fs.utimesSync(lockPath, now, now)
      }
    } catch (e) {
      /* c8 ignore next - Defensive touch-error log; only fires if
         utimesSync throws on a lock we just successfully created. */
      logger.warn(`Failed to touch lock ${lockPath}: ${errorMessage(e)}`)
    }
  }

  /**
   * Start periodic touching of a lock file.
   * Aligned with npm npx strategy to prevent false stale detection.
   *
   * @param lockPath - Path to the lock directory
   * @param intervalMs - Touch interval in milliseconds
   */
  private startTouchTimer(lockPath: string, intervalMs: number): void {
    if (intervalMs <= 0 || this.touchTimers.has(lockPath)) {
      return
    }

    const timer = setInterval(() => {
      this.touchLock(lockPath)
    }, intervalMs)

    // Prevent timer from keeping process alive.
    timer.unref()

    this.touchTimers.set(lockPath, timer)
  }

  /**
   * Stop periodic touching of a lock file.
   *
   * @param lockPath - Path to the lock directory
   */
  private stopTouchTimer(lockPath: string): void {
    const timer = this.touchTimers.get(lockPath)
    if (timer) {
      clearInterval(timer)
      this.touchTimers.delete(lockPath)
    }
  }

  /**
   * Check if a lock is stale based on mtime.
   * Uses second-level granularity to avoid APFS floating-point precision issues.
   * Aligned with npm's npx locking strategy.
   *
   * @param lockPath - Path to the lock directory
   * @param staleMs - Stale timeout in milliseconds
   * @returns True if lock exists and is stale
   */
  private isStale(lockPath: string, staleMs: number): boolean {
    try {
      // Use single statSync call instead of existsSync + statSync.
      // throwIfNoEntry: false returns undefined if path doesn't exist.
      // oxlint-disable-next-line socket/prefer-exists-sync -- need mtimeMs for staleness check; existsSync would discard the metadata.
      const stats = getFs().statSync(lockPath, { throwIfNoEntry: false })
      if (!stats) {
        return false
      }
      // Compare in milliseconds. The previous implementation floored
      // both sides to seconds, which silently rounded sub-second
      // `staleMs` values up to ~1s (staleMs=500 → staleSeconds=0, so
      // the lock had to be 1s+ past mtime before being considered
      // stale). Node returns mtime with ms precision on all platforms
      // we support; APFS's second-level filesystem precision just
      // means the low bits are zero, which the subtraction handles.
      return DateNow() - stats.mtime.getTime() > staleMs
    } catch {
      /* c8 ignore next - statSync error → not stale; only fires
         when stat throws (rare; throwIfNoEntry: false catches
         missing files). */
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
      staleMs = 5000,
      touchIntervalMs = 2000,
    } = options

    // Ensure exit handler is registered before any lock acquisition.
    this.ensureExitHandler()

    return (await pRetry(
      async () => {
        try {
          // Check for stale lock and remove if necessary.
          // isStale() handles non-existent paths efficiently with single statSync call.
          if (this.isStale(lockPath, staleMs)) {
            logger.log(`Removing stale lock: ${lockPath}`)
            try {
              safeDeleteSync(lockPath, { recursive: true })
            } catch {
              // Ignore errors removing stale lock - will retry.
            }
          }

          // Ensure parent directory exists. Use path.dirname() so that both
          // POSIX and Windows separators (and mixed-separator inputs) are
          // handled correctly — the previous Math.max(lastIndexOf('/'), '\\')
          // approach failed on relative paths and mixed-separator inputs.
          const fs = getFs()
          const parent = getPath().dirname(lockPath)
          if (parent && parent !== '.' && parent !== lockPath) {
            fs.mkdirSync(parent, { recursive: true })
          }

          // Atomic lock acquisition via mkdir (without recursive).
          // Without recursive, mkdirSync throws EEXIST if another process
          // already owns the directory. No pre-check: an existsSync +
          // mkdirSync pair opens a TOCTOU window without adding safety,
          // because mkdirSync is atomic on its own.
          fs.mkdirSync(lockPath)

          // Track lock for cleanup.
          this.activeLocks.add(lockPath)

          // Start periodic touching to prevent stale detection.
          this.startTouchTimer(lockPath, touchIntervalMs)

          // Return release function.
          return () => this.release(lockPath)
        } catch (e) {
          const code = (e as NodeJS.ErrnoException).code

          // Handle lock contention - lock already exists.
          if (code === 'EEXIST') {
            if (this.isStale(lockPath, staleMs)) {
              throw new ErrorCtor(`Stale lock detected: ${lockPath}`)
            }
            throw new ErrorCtor(`Lock already exists: ${lockPath}`)
          }

          // Handle permission errors - not retryable.
          if (code === 'EACCES' || code === 'EPERM') {
            throw new ErrorCtor(
              `Permission denied creating lock: ${lockPath}. ` +
                'Check directory permissions or run with appropriate access.',
              { cause: e },
            )
          }

          // Handle read-only filesystem - not retryable.
          if (code === 'EROFS') {
            throw new ErrorCtor(
              `Cannot create lock on read-only filesystem: ${lockPath}`,
              { cause: e },
            )
          }

          // Handle parent path issues - not retryable.
          if (code === 'ENOTDIR') {
            const lastSlashIndex = MathMax(
              lockPath.lastIndexOf('/'),
              lockPath.lastIndexOf('\\'),
            )
            const parentDir =
              lastSlashIndex === -1 ? '.' : lockPath.slice(0, lastSlashIndex)
            throw new ErrorCtor(
              `Cannot create lock directory: ${lockPath}\n` +
                'A path component is a file when it should be a directory.\n' +
                `Parent path: ${parentDir}\n` +
                'To resolve:\n' +
                `  1. Check if "${parentDir}" contains a file instead of a directory\n` +
                '  2. Remove any conflicting files in the path\n' +
                '  3. Ensure the full parent directory structure exists',
              { cause: e },
            )
          }

          if (code === 'ENOENT') {
            const lastSlashIndex = MathMax(
              lockPath.lastIndexOf('/'),
              lockPath.lastIndexOf('\\'),
            )
            const parentDir =
              lastSlashIndex === -1 ? '.' : lockPath.slice(0, lastSlashIndex)
            throw new ErrorCtor(
              `Cannot create lock directory: ${lockPath}\n` +
                `Parent directory does not exist: ${parentDir}\n` +
                'To resolve:\n' +
                `  1. Ensure the parent directory "${parentDir}" exists\n` +
                `  2. Create the directory structure: mkdir -p "${parentDir}"\n` +
                '  3. Check filesystem permissions allow directory creation',
              { cause: e },
            )
          }

          // Re-throw other errors with context.
          throw new ErrorCtor(`Failed to acquire lock: ${lockPath}`, {
            cause: e,
          })
        }
      },
      {
        retries,
        baseDelayMs,
        maxDelayMs,
        jitter: true,
      },
    ))!
  }

  /**
   * Release a lock and remove from tracking.
   * Stops periodic touching and removes the lock directory.
   *
   * @param lockPath - Path to the lock directory
   *
   * @example
   * ```typescript
   * processLock.release('/tmp/my-lock')
   * ```
   */
  release(lockPath: string): void {
    // Stop periodic touching.
    this.stopTouchTimer(lockPath)

    try {
      if (getFs().existsSync(lockPath)) {
        safeDeleteSync(lockPath, { recursive: true })
      }
      this.activeLocks.delete(lockPath)
    } catch (e) {
      logger.warn(`Failed to release lock ${lockPath}: ${errorMessage(e)}`)
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
