/**
 * @file Choose vitest invocation strategy based on the scope of changes. Three
 *   modes:
 *
 *   - `all` — run the full suite (`vitest run`). Used in CI and on explicit
 *     `--all` / `--force` / `FORCE_TEST=1`.
 *   - `staged` — pre-commit hook scope. Hand `git diff --cached` filenames to
 *     `vitest related <files…> --run` so vitest walks the module graph and
 *     finds every test transitively touched by the staged delta. The `--run`
 *     flag is mandatory: `vitest related` defaults to watch mode just like
 *     the bare `vitest` invocation, which would hang the pre-commit hook.
 *     See https://vitest.dev/guide/cli.html#vitest-related.
 *   - `changed` — local-dev scope (working tree). Run `vitest --changed`,
 *     vitest's native "compare vs HEAD, including uncommitted" mode. This
 *     catches transitive imports the basename-mapping approach misses (a change
 *     to a util shared by many test files used to fall back to "run all";
 *     `--changed` walks the actual graph instead). Config-file changes
 *     (`vitest.config*`, `tsconfig*`) still escalate to `all` because
 *     module-graph traversal doesn't capture config-derived changes (test
 *     discovery, resolver aliases, etc.).
 */

import process from 'node:process'

import { getChangedFilesSync } from '@socketsecurity/lib-stable/git/changed'
import { getStagedFilesSync } from '@socketsecurity/lib-stable/git/staged'
import { normalizePath } from '@socketsecurity/lib-stable/paths/normalize'

/**
 * Files whose change forces a full-suite run. Module-graph traversal via
 * `vitest --changed` / `vitest related` doesn't pick up config- driven
 * discovery + alias changes — escalate to `all` here.
 */
const FULL_SUITE_TRIGGER_PATTERNS = [
  /vitest\.config/,
  /tsconfig/,
  /\.config\/vitest/,
]

export interface TestStrategy {
  /**
   * `all` — pass no scope args (run the whole suite). `changed` — pass
   * `--changed` to vitest. `related` — pass `related <files…>` to vitest.
   * `skip` — no changes; skip the run entirely.
   */
  mode: 'all' | 'changed' | 'related' | 'skip'
  reason: string
  /**
   * Files for `related` mode. Empty for the other modes.
   */
  files: readonly string[]
}

export function getTestsToRun(
  options: { staged?: boolean; all?: boolean } = {},
): TestStrategy {
  const { all = false, staged = false } = options

  if (all || process.env['FORCE_TEST'] === '1') {
    return { mode: 'all', reason: 'explicit --all flag', files: [] }
  }

  if (process.env['CI'] === 'true') {
    return { mode: 'all', reason: 'CI environment', files: [] }
  }

  const changedFiles = staged ? getStagedFilesSync() : getChangedFilesSync()

  if (changedFiles.length === 0) {
    return {
      mode: 'skip',
      reason: 'no changes detected',
      files: [],
    }
  }

  for (const file of changedFiles) {
    const normalized = normalizePath(file)
    for (const pattern of FULL_SUITE_TRIGGER_PATTERNS) {
      if (pattern.test(normalized)) {
        return {
          mode: 'all',
          reason: `config change escalates to full run (${file})`,
          files: [],
        }
      }
    }
  }

  // Staged → run tests RELATED to the staged file set. Vitest walks
  // the module graph and surfaces every test file transitively affected.
  if (staged) {
    return {
      mode: 'related',
      reason: `${changedFiles.length} staged file(s)`,
      files: changedFiles,
    }
  }

  // Working-tree changes → use vitest's native --changed mode. Same
  // module-graph walk, but the file list comes from vitest's own
  // git integration (compares vs HEAD, includes uncommitted).
  return {
    mode: 'changed',
    reason: `${changedFiles.length} changed file(s)`,
    files: [],
  }
}
