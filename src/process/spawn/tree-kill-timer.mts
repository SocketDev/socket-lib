/**
 * @file The `killTreeOnTimeout` timer for {@link spawn}.
 *   Node's `timeout` option signals ONLY the direct child. A spawned tool that
 *   spawned its own children therefore leaks the whole subtree on every
 *   timeout: the middle process takes SIGTERM, the grandchildren reparent to
 *   init, and nothing reports it, because the spawn failed exactly the way the
 *   caller expected it to. Measured on a three-level tree — the grandchild was
 *   still alive at `ppid 1` after the timeout fired.
 *   There is a second, quieter cost. A leaked grandchild inherits the child's
 *   stdout pipe and holds it open, so the spawn promise does not settle when
 *   the timeout fires — it settles when the orphan eventually exits. A 400 ms
 *   timeout was observed taking 30 s to resolve for that reason.
 *   Lives in its own module rather than in `child.mts` because the timer is a
 *   distinct phase with its own ordering constraint (see
 *   {@link TREE_KILL_LEAD_MS}), and folding it in pushed `child.mts` past the
 *   500-line soft cap.
 */

import { killProcessTree } from './kill-tree.mjs'
import { resolveSpawnTimeout } from './timeout.mjs'

/**
 * How far ahead of Node's own `timeout` the tree-kill fires, in ms.
 *
 * Ordering is the whole point. The instant Node's timeout kills the direct
 * child, its descendants reparent to init, and a process-table read after that
 * moment can no longer tell they were ever part of this tree. So the walk has
 * to happen while the tree is still shaped like a tree. Firing marginally
 * early guarantees that, and the lead is small enough that a process which
 * would have finished in time still does.
 */
export const TREE_KILL_LEAD_MS = 25

/**
 * Arm a process-tree kill for a spawn that opted into `killTreeOnTimeout`.
 *
 * Node's `timeout` option is deliberately left in place: it still produces the
 * error the caller expects. This only adds the descendant cleanup Node does
 * not do, so opting in changes what gets cleaned up, never what gets thrown.
 *
 * No-op without the opt-in, without a positive timeout, or before a process
 * exists. The timer is unref'd so it can never hold the event loop open, and
 * it is cleared on settle either way so a rejecting spawn neither leaves it
 * armed nor raises an unhandled rejection from this bookkeeping.
 */
export function maybeArmTreeKill(
  spawnPromise: { process?: unknown | undefined } & PromiseLike<unknown>,
  spawnOptions: Record<string, unknown>,
): void {
  if (spawnOptions['killTreeOnTimeout'] !== true) {
    return
  }
  const timeoutMs = resolveSpawnTimeout(
    spawnOptions as Parameters<typeof resolveSpawnTimeout>[0],
  )
  if (typeof timeoutMs !== 'number' || timeoutMs <= 0) {
    return
  }
  const child = spawnPromise.process
  if (!child) {
    return
  }
  const timer = setTimeout(
    () => {
      // Non-detached: the child leads no process group, so kill-tree walks the
      // process table. Best-effort by contract; it never throws.
      killProcessTree(child as never, { detached: false })
    },
    Math.max(1, timeoutMs - TREE_KILL_LEAD_MS),
  )
  timer.unref?.()
  void spawnPromise.then(
    () => clearTimeout(timer),
    () => clearTimeout(timer),
  )
}
