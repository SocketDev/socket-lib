/**
 * @file Cross-platform process-tree termination. A spawned package manager,
 *   proxy, or build tool spawns its own children; killing only the direct child
 *   orphans them (they reparent to init on POSIX and run forever). These
 *   helpers kill the whole tree:
 *
 *   - POSIX: when the child was spawned `detached: true` it leads its own process
 *     group, so `process.kill(-pid, signal)` signals every member at once. Pass
 *     `{ detached: true }` (the default) for that behavior; pass `{ detached:
 *     false }` to signal only the single pid.
 *   - Windows: there are no POSIX process groups, so we shell out to `taskkill /T
 *     /F /pid <pid>`, which walks and terminates the descendant tree. The
 *     `signal` argument is ignored on Windows (taskkill is always a forceful
 *     terminate). Both helpers are best-effort and never throw: a process that
 *     already exited (ESRCH) or that we lack permission to signal (EPERM) is
 *     treated as "nothing to do", because a cleanup kill must not mask the
 *     caller's original control flow. `killProcessTree` returns `true` if a
 *     kill was attempted, `false` if the pid was invalid or already gone.
 */

import { WIN32 } from '../../constants/platform'
import { getNodeChildProcess } from '../../node/child-process'

import type { ChildProcess } from 'node:child_process'

export interface KillProcessTreeOptions {
  /**
   * POSIX only. When `true` (default), signal the child's entire process group
   * via the negative pid — requires the child to have been spawned `detached:
   * true`. When `false`, signal only the single pid. Ignored on Windows
   * (taskkill always kills the tree).
   */
  detached?: boolean | undefined
  /**
   * POSIX signal to send (default `'SIGTERM'`). Ignored on Windows, where
   * taskkill performs a forceful terminate.
   */
  signal?: NodeJS.Signals | number | undefined
}

/**
 * Probe whether a pid is still alive. Uses signal 0, which performs the
 * permission/existence check without delivering a signal. Returns `false` for
 * pid <= 1 (kernel/init) so callers don't mistake those for a live child.
 */
export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 1) {
    return false
  }
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Kill a process and its descendants. See the file header for the
 * POSIX-process-group vs. Windows-taskkill strategy. Best-effort: never throws.
 * Returns `true` if a kill was attempted, `false` if the pid was invalid or the
 * process had already exited.
 */
export function killProcessTree(
  target: number | ChildProcess,
  options?: KillProcessTreeOptions | undefined,
): boolean {
  const pid = resolvePid(target)
  if (pid === undefined) {
    return false
  }
  // Null-prototype spread so a poisoned Object.prototype (e.g. a malicious
  // `detached` getter) can't influence option resolution — the fleet
  // options-object idiom.
  const opts = { __proto__: null, ...options } as KillProcessTreeOptions
  const detached = opts.detached !== false
  const signal = opts.signal ?? 'SIGTERM'
  try {
    if (WIN32) {
      // No POSIX process groups on Windows; taskkill /T walks the tree.
      getNodeChildProcess().spawnSync(
        'taskkill',
        ['/T', '/F', '/pid', String(pid)],
        { stdio: 'ignore' },
      )
    } else if (detached) {
      // Negative pid → the whole process group led by the detached child.
      process.kill(-pid, signal)
    } else {
      process.kill(pid, signal)
    }
    return true
  } catch {
    // ESRCH (already gone) / EPERM (not ours): nothing actionable.
    return false
  }
}

/**
 * Resolve a pid from either a raw number or a spawned ChildProcess. Returns
 * `undefined` for a missing/invalid pid or a process that already exited.
 * Exported for direct testing.
 */
export function resolvePid(target: number | ChildProcess): number | undefined {
  if (typeof target === 'number') {
    return Number.isInteger(target) && target > 1 ? target : undefined
  }
  // A ChildProcess: skip if it already settled (exited or was signalled) or
  // never got a pid (spawn failed). Node types exitCode/signalCode as
  // `number | null` / `NodeJS.Signals | null`, so the null comparison is the
  // external-API exception to prefer-undefined-over-null.
  // oxlint-disable-next-line socket/prefer-undefined-over-null -- Node ChildProcess.exitCode/signalCode are `… | null`
  if (target.exitCode !== null || target.signalCode !== null) {
    return undefined
  }
  const { pid } = target
  return typeof pid === 'number' && pid > 1 ? pid : undefined
}
