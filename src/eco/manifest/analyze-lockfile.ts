/**
 * @fileoverview `analyzeLockfile(lockfile)` — returns a
 * `LockfileStats` summary (counts by dep type, total packages,
 * per-ecosystem breakdown).
 *
 * `maxDepth` + `avgDepth` are reported as 0 — the JS-side
 * `ParsedLockfile` shape doesn't preserve a dep-tree, only the flat
 * package list. Matches socket-btm's smol behavior exactly.
 */

import { ObjectFreeze } from '../../primordials/object'
import { getSmolManifest } from '../../smol/manifest'

import type { LockfileStats, ParsedLockfile } from './types'

export function jsAnalyzeLockfile(lockfile: ParsedLockfile): LockfileStats {
  let prodDeps = 0
  let devDeps = 0
  let optionalDeps = 0

  const pkgs = lockfile.packages
  for (let i = 0, { length } = pkgs; i < length; i++) {
    switch (pkgs[i]!.depType) {
      case 'prod':
        prodDeps++
        break
      case 'dev':
        devDeps++
        break
      case 'optional':
        optionalDeps++
        break
    }
  }

  return ObjectFreeze({
    __proto__: null,
    totalPackages: pkgs.length,
    prodDeps,
    devDeps,
    optionalDeps,
    byEcosystem: ObjectFreeze({
      __proto__: null,
      [lockfile.ecosystem]: pkgs.length,
    }),
    maxDepth: 0,
    avgDepth: 0,
  }) as unknown as LockfileStats
}

const _smol = getSmolManifest()

export const analyzeLockfile: (lockfile: ParsedLockfile) => LockfileStats =
  _smol ? _smol.analyzeLockfile : jsAnalyzeLockfile
