/**
 * @file Paths for repository CLI contract tests.
 */

import path from 'node:path'

import { REPO_ROOT } from '../../scripts/fleet/paths.mts'

export function scriptCliPath(
  relative:
    | 'repo/audit-api-usage.mts'
    | 'repo/build/verify-dist.mts'
    | 'repo/codemod/prefer-node-getter.mts'
    | 'repo/expose-leaf.mts'
    | 'repo/check/docs-imports-resolve.mts'
    | 'repo/check/force-delete-is-opt-in.mts'
    | 'validate/dist-exports.mts'
    | 'validate/esm-named-exports.mts',
): string {
  return path.join(REPO_ROOT, 'scripts', relative)
}
