/**
 * @file Isolated git index helper. withIsolatedIndex runs a function with a
 *   temporary GIT_INDEX_FILE, bypassing the shared .git/index.lock race that
 *   blocks concurrent git operations in a shared checkout. The temp index is
 *   created under getNodeOs().tmpdir(), seeded from HEAD's tree (`git read-tree
 *   HEAD`) so it starts as a copy of the current commit rather than empty, set
 *   via the GIT_INDEX_FILE env var for the duration of the function, and
 *   removed afterward. Seeding matters: an empty temp index means an ordinary
 *   `git add <path>` + `git commit` inside the callback produces a commit whose
 *   tree contains ONLY the added path — every other previously tracked file
 *   reads as deleted in that commit, even though nothing removed it. Seeding
 *   from HEAD makes that same ordinary add/commit sequence behave the way a
 *   normal commit does: HEAD's tree plus the staged change. On an unborn branch
 *   (no commits yet) `read-tree HEAD` has nothing to copy and the temp index is
 *   left empty, which is correct for a repo with no history. Use this when a
 *   `git add`/commit races another session's git operations (the fleet
 *   parallel-claude-sessions scenario): the temp index sidesteps the shared
 *   lock entirely, so the commit lands without waiting for the other process.
 *   Note this isolates from the SHARED index's current staged state too —
 *   anything staged-but-uncommitted in the real index is intentionally not
 *   visible inside the callback, which is the point: it avoids racing whatever
 *   that other process has staged. The function MUST be synchronous: the env
 *   mutation is process-global, and an async function would leak GIT_INDEX_FILE
 *   to concurrent microtasks.
 */

import { safeDeleteSync } from '../fs/safe.mjs'
import { getNodeFs } from '../node/fs.mjs'
import { getNodePath } from '../node/path.mjs'
import { spawnSync } from '../process/spawn/child.mjs'
import { getCwd } from './repo.mjs'
import { getGitPath } from './shared.mjs'
import { getNodeOs } from '../node/os.mjs'
import { getNodeProcess } from '../node/process.mjs'

/**
 * Options for {@link withIsolatedIndex}.
 */
export interface WithIsolatedIndexOptions {
  /**
   * The repository to operate on. Defaults to the current working directory
   * (via getCwd()), matching gitSync/gitSpawn's own cwd default — pass this
   * explicitly to target a repo other than getNodeProcess().cwd() (e.g. from a
   * test, where `process.chdir()` is banned fleet-wide).
   */
  cwd?: string | undefined
}

/**
 * Run a synchronous function with a temporary GIT_INDEX_FILE. The temp index
 * directory is created under getNodeOs().tmpdir(), seeded from HEAD's tree so
 * it starts as a copy of the current commit rather than empty, the env var is
 * set for the duration of the function, and both the directory and the env var
 * are cleaned up in a finally block. The function MUST be synchronous.
 *
 * @example
 *   withIsolatedIndex(() => {
 *     gitSync(['add', '--', filePath])
 *     gitSync(['commit', '-m', 'message'])
 *   })
 */
export function withIsolatedIndex<T>(
  fn: () => T,
  options?: WithIsolatedIndexOptions | undefined,
): T {
  const { cwd } = { __proto__: null, ...options } as WithIsolatedIndexOptions
  const fs = getNodeFs()
  const path = getNodePath()
  const os = getNodeOs()
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-isolated-index-'))
  const indexPath = path.join(tmpDir, 'index')
  const nodeProcess = getNodeProcess()
  const prevIndexFile = nodeProcess.env['GIT_INDEX_FILE']
  nodeProcess.env['GIT_INDEX_FILE'] = indexPath
  try {
    // Seed the temp index from HEAD so it starts as a copy of the current
    // commit's tree, not empty. Best-effort: on an unborn branch (no commits
    // yet) this fails and the temp index is simply left empty, which is the
    // correct starting state when there is no HEAD tree to copy.
    spawnSync(getGitPath(), ['read-tree', 'HEAD'], { cwd: cwd ?? getCwd() })
    return fn()
  } finally {
    if (prevIndexFile === undefined) {
      delete nodeProcess.env['GIT_INDEX_FILE']
    } else {
      nodeProcess.env['GIT_INDEX_FILE'] = prevIndexFile
    }
    safeDeleteSync(tmpDir, { recursive: true })
  }
}
