/**
 * @file Fleet-canonical vitest setup, wired via `setupFiles` in
 *   `.config/repo/vitest.config.mts` (loaded only when present). Registers the
 *   fleet's custom matchers globally with `expect.extend` so every test under
 *   `test/**` can use them without an import. Currently: `toContainPath` — a
 *   separator-agnostic path-substring assertion (see ./../../_shared/fleet/lib/
 *   matchers.mts). Also isolates git so a test's git ops can't touch the live
 *   repo. Repo-specific setup belongs in `test/scripts/repo/setup.mts`.
 */

import { expect } from 'vitest'

import { toContainPathResult } from '../../_shared/fleet/lib/matchers.mts'

// Isolate git from the live repo. When the suite runs from the pre-commit
// hook, git exports GIT_DIR / GIT_WORK_TREE / GIT_INDEX_FILE (etc.) pointing
// at THIS repo, and git honors them above cwd-based discovery — so a test
// that spawns `git` with `cwd: tmpDir` would still commit onto the live
// HEAD and rewrite the real .git/config. Strip the inherited context so
// every git spawn resolves from its own cwd, and pin the config files to
// /dev/null so `git config` in a test can never touch a real config.
for (const name of [
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_CEILING_DIRECTORIES',
  'GIT_COMMON_DIR',
  'GIT_DIR',
  'GIT_INDEX_FILE',
  'GIT_NAMESPACE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_PREFIX',
  'GIT_WORK_TREE',
]) {
  delete process.env[name]
}
process.env['GIT_CONFIG_GLOBAL'] = '/dev/null'
process.env['GIT_CONFIG_SYSTEM'] = '/dev/null'

expect.extend({
  toContainPath(received: unknown, expected: string) {
    return toContainPathResult(received, expected)
  },
})

declare module 'vitest' {
  // Type params must match vitest's own `Matchers<T = any>` exactly, or the
  // declaration merge fails with TS2428.
  // oxlint-disable-next-line typescript/no-explicit-any -- must mirror vitest's `Matchers<T = any>` for the declaration merge.
  interface Matchers<T = any> {
    // Assert the received path string contains `expected` after both are
    // normalized to "/" separators — cross-platform path assertions without
    // per-OS branching.
    toContainPath: (expected: string) => T
  }
}
