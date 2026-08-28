/**
 * @file Cross-platform process-tree termination. A spawned package manager,
 *   proxy, or build tool spawns its own children; killing only the direct child
 *   orphans them (they reparent to init on POSIX and run forever). These
 *   helpers kill the whole tree:
 *
 *   - POSIX, `detached: true` (default): the child leads its own process group,
 *     so `process.kill(-pid, signal)` signals every member at once.
 *   - POSIX, `detached: false`: there is no group to signal, so the process table
 *     is snapshotted once and every descendant is signalled individually. A
 *     non-detached child is the common case — Node's own `timeout` option
 *     signals only the direct child — so without this walk a timed-out spawn
 *     leaves its whole subtree alive and reparented to init.
 *   - Windows: there are no POSIX process groups, so we shell out to `taskkill /T
 *     /F /pid <pid>`, which walks and terminates the descendant tree. The
 *     `signal` argument is ignored on Windows (taskkill is always a forceful
 *     terminate). Both helpers are best-effort and never throw: a process that
 *     already exited (ESRCH) or that we lack permission to signal (EPERM) is
 *     treated as "nothing to do", because a cleanup kill must not mask the
 *     caller's original control flow. `killProcessTree` returns `true` if a
 *     kill was attempted, `false` if the pid was invalid or already gone.
 */

import { isWin32 } from '../../constants/platform.mjs'
import { getNodeChildProcess } from '../../node/child-process.mjs'
import { readProcessTree } from '../tree.mjs'

import type { ChildProcess } from 'node:child_process'

export interface KillProcessTreeOptions {
  /**
   * POSIX only. When `true` (default), signal the child's entire process group
   * via the negative pid — requires the child to have been spawned `detached:
   * true`. When `false`, signal only the single pid. Ignored on Windows, where
   * taskkill always kills the tree.
   */
  detached?: boolean | undefined
  /**
   * POSIX signal to send (default `'SIGTERM'`). Ignored on Windows, where
   * taskkill performs a forceful terminate.
   */
  signal?: NodeJS.Signals | number | undefined
}

/**
 * Every descendant of `pid`, deepest-last, from a `pid -> ppid` snapshot.
 *
 * Why a snapshot rather than repeated `pgrep -P`: a process that exits during
 * the walk reparents its children to init, and they would vanish from a
 * later query while still holding memory. Reading the table once fixes the
 * shape of the tree before anything is signalled.
 *
 * The visited set doubles as a cycle guard: a corrupt table must not hang a
 * cleanup path.
 */
export function collectDescendantPids(
  pid: number,
  parents: ReadonlyMap<number, number>,
): number[] {
  const childrenByParent = new Map<number, number[]>()
  for (const [child, parent] of parents) {
    const siblings = childrenByParent.get(parent)
    if (siblings) {
      siblings.push(child)
    } else {
      childrenByParent.set(parent, [child])
    }
  }
  const descendants: number[] = []
  const seen = new Set<number>([pid])
  const queue = [pid]
  while (queue.length > 0) {
    const next = queue.shift()!
    const children = childrenByParent.get(next) ?? []
    for (let i = 0, { length } = children; i < length; i += 1) {
      const child = children[i]!
      if (!seen.has(child)) {
        seen.add(child)
        descendants.push(child)
        queue.push(child)
      }
    }
  }
  return descendants
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
  // `detached` getter) can't influence option resolution — the Socket
  // options-object idiom.
  const opts = { __proto__: null, ...options } as KillProcessTreeOptions
  const detached = opts.detached !== false
  const signal = opts.signal ?? 'SIGTERM'
  try {
    if (isWin32()) {
      // No POSIX process groups on Windows; taskkill /T walks the tree.
      // taskkill never throws — it sets status. 0 = killed (or at least
      // dispatched a kill); 128 = "process not found" (ERROR_PROC_NOT_FOUND).
      const childProcess = getNodeChildProcess()
      // Treat non-zero as "nothing to do" to match the POSIX ESRCH branch.
      // Synchronous taskkill in a best-effort cleanup path; async spawn
      // would race teardown.
      // oxlint-disable-next-line socket/prefer-async-spawn -- sync cleanup
      const res = childProcess.spawnSync(
        'taskkill',
        ['/T', '/F', '/pid', String(pid)],
        { stdio: 'ignore' },
      )
      return res.status === 0
    }
    if (detached) {
      // Negative pid → the whole process group led by the detached child.
      process.kill(-pid, signal)
      return true
    }
    // Not a group leader, so there is no group to signal. Walk the process
    // table instead — without this the function signals ONE pid while its name
    // promises a tree, and every grandchild survives and reparents to init.
    // That is the exact shape of the leak this fallback exists for: a spawn
    // that times out, kills its direct child, and silently leaves the tree
    // behind holding memory forever.
    const descendants = collectDescendantPids(pid, readParentMap())
    // Descendants first: the tree was snapshotted before any signal, so both
    // orders reach every pid, but killing children first stops the root from
    // spawning more while the walk is in flight.
    for (let i = 0, { length } = descendants; i < length; i += 1) {
      try {
        process.kill(descendants[i]!, signal)
      } catch {
        // Already gone, or not ours to signal — the same best-effort contract
        // the single-pid path has always had.
      }
    }
    process.kill(pid, signal)
    return true
  } catch {
    // Nothing actionable: ESRCH means the process is already gone and EPERM
    // means it isn't ours to signal.
    return false
  }
}

/**
 * Snapshot the POSIX process table as `pid -> ppid`.
 *
 * Delegates to {@link readProcessTree}, the package's one process-table
 * reader, rather than running its own `ps`. Two readers in one package drift:
 * this one shipped without the `maxBuffer` bump that a full table on a busy
 * host needs, and would have silently truncated where the other does not.
 *
 * Returns an empty map when `ps` is unavailable, which makes the caller fall
 * back to signalling the single pid — never to signalling nothing it did not
 * mean to.
 */
export function readParentMap(): Map<number, number> {
  const parents = new Map<number, number>()
  const rows = readProcessTree()
  for (let i = 0, { length } = rows; i < length; i += 1) {
    parents.set(rows[i]!.pid, rows[i]!.ppid)
  }
  return parents
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
  // A ChildProcess: skip if it already exited or was signalled, or if a failed
  // spawn left it without a pid. Node types exitCode/signalCode as
  // `number | null` / `NodeJS.Signals | null`, so the null comparison is the
  // external-API exception to prefer-undefined-over-null.
  // oxlint-disable-next-line socket/prefer-undefined-over-null -- Node ChildProcess.exitCode/signalCode are `… | null`
  if (target.exitCode !== null || target.signalCode !== null) {
    return undefined
  }
  const { pid } = target
  return typeof pid === 'number' && pid > 1 ? pid : undefined
}
