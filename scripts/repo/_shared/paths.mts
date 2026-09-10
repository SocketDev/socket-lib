/**
 * @file Repo-specific path constants for this package's own scripts. Mantra:
 *   1 path, 1 reference. The fleet-canonical paths live in
 *   `scripts/fleet/paths.mts`; this module owns only the tails that are unique
 *   to socket-lib, so a relocation of the external-dependency trees is a
 *   one-file edit.
 */

import path from 'node:path'
import { normalizePath } from '@socketsecurity/lib-stable/paths/normalize'

import { REPO_ROOT } from '../../fleet/paths.mts'
import { coverageOutputSegments } from '../../fleet/cover/scope.mts'

/**
 * Hand-maintained sources for the vendored external dependencies, before the
 * bundler runs.
 */
export const SRC_EXTERNAL_DIR = normalizePath(
  path.join(REPO_ROOT, 'src', 'external'),
)

/**
 * Built vendored external dependencies, the tree the validators read.
 */
export const DIST_EXTERNAL_DIR = normalizePath(
  path.join(REPO_ROOT, 'dist', 'external'),
)

export function coverageDiagnosticPaths(repoRoot: string) {
  const cache = path.join(repoRoot, '.cache')
  const output = path.join(cache, 'repo', 'coverage-diagnostics')
  return {
    __proto__: null,
    output,
    measurement: path.join(
      cache,
      'fleet',
      ...coverageOutputSegments('fast', { measurement: true }),
    ),
    comparison: path.join(output, 'comparison.json'),
  }
}
