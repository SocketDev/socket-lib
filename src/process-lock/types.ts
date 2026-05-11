/**
 * @fileoverview Public type surface for `process-lock/*` modules — the
 * `ProcessLockOptions` bag accepted by `processLock.acquire` and
 * `processLock.withLock`. Pure types, no runtime side effects.
 */

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
   * Aligned with npm's npx locking strategy (5 seconds).
   * @default 5000 (5 seconds)
   */
  staleMs?: number | undefined

  /**
   * Interval for touching lock file to keep it fresh in milliseconds.
   * Set to 0 to disable periodic touching.
   * @default 2000 (2 seconds)
   */
  touchIntervalMs?: number | undefined
}
