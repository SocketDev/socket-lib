/**
 * @fileoverview Singleton `processLock` instance — the canonical
 * cross-cutting lock manager. Most callers want this; only test
 * harnesses that need an isolated lock-tracking state should
 * construct a `ProcessLockManager` directly.
 */

import { ProcessLockManager } from './manager'

/**
 * Singleton process lock manager instance.
 *
 * @example
 * ```typescript
 * import { processLock } from '@socketsecurity/lib/proc-lock/instance'
 *
 * await processLock.withLock('/tmp/my-lock', async () => {
 *   // critical section
 * })
 * ```
 */
export const processLock = new ProcessLockManager()
