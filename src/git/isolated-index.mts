/**
 * @file Isolated git index helper. withIsolatedIndex runs a function with a
 *   temporary GIT_INDEX_FILE, bypassing the shared .git/index.lock race that
 *   blocks concurrent git operations in a shared checkout. The temp index is
 *   created under os.tmpdir(), set via the GIT_INDEX_FILE env var for the
 *   duration of the function, and removed afterward. Use this when a git
 *   add/commit races another session's git operations (the fleet
 *   parallel-claude-sessions scenario): the temp index sidesteps the shared
 *   lock entirely, so the commit lands without waiting for the other process.
 *   The function MUST be synchronous: the env mutation is process-global, and
 *   an async function would leak GIT_INDEX_FILE to concurrent microtasks.
 */

import os from 'node:os'
import process from 'node:process'

import { safeDeleteSync } from '../fs/safe.mjs'
import { getNodeFs } from '../node/fs.mjs'
import { getNodePath } from '../node/path.mjs'

/**
 * Run a synchronous function with a temporary GIT_INDEX_FILE. The temp index
 * directory is created under os.tmpdir(), the env var is set for the duration
 * of the function, and both the directory and the env var are cleaned up in a
 * finally block. The function MUST be synchronous.
 *
 * @example
 *   withIsolatedIndex(() => {
 *     gitSync(['add', '--', filePath])
 *     gitSync(['commit', '-m', 'message'])
 *   })
 */
export function withIsolatedIndex<T>(fn: () => T): T {
  const fs = getNodeFs()
  const path = getNodePath()
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-isolated-index-'))
  const indexPath = path.join(tmpDir, 'index')
  const prevIndexFile = process.env['GIT_INDEX_FILE']
  process.env['GIT_INDEX_FILE'] = indexPath
  try {
    return fn()
  } finally {
    if (prevIndexFile === undefined) {
      delete process.env['GIT_INDEX_FILE']
    } else {
      process.env['GIT_INDEX_FILE'] = prevIndexFile
    }
    safeDeleteSync(tmpDir, { recursive: true })
  }
}
