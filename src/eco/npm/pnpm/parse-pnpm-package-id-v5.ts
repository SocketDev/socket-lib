/**
 * @file `parsePnpmPackageIdV5(pkgId)` — extracts `{ name, version }` from a
 *   pnpm v5 package key. Spec forms handled:
 *
 *   - `/name/version` → unscoped
 *   - `/@scope/name/version` → scoped
 *   - `/name/version_peer-suffix` → peer-dep suffix stripped Returns `{ name:
 *     pkgId, version: '0.0.0' }` for unparseable input — matches socket-btm's
 *     smol-manifest leniency.
 */

import {
  StringPrototypeIndexOf,
  StringPrototypeSlice,
  StringPrototypeSplit,
} from '../../../primordials/string'

export interface PnpmPackageId {
  readonly name: string
  readonly version: string
}

export function parsePnpmPackageIdV5(pkgId: string): PnpmPackageId {
  const withoutSlash = pkgId[0] === '/' ? StringPrototypeSlice(pkgId, 1) : pkgId
  const underscoreIdx = StringPrototypeIndexOf(withoutSlash, '_')
  const withoutPeerSuffix =
    underscoreIdx !== -1
      ? StringPrototypeSlice(withoutSlash, 0, underscoreIdx)
      : withoutSlash

  if (withoutPeerSuffix[0] === '@') {
    const parts = StringPrototypeSplit(withoutPeerSuffix, '/')
    if (parts.length < 2) {
      return { name: withoutPeerSuffix, version: '0.0.0' }
    }
    return {
      name: `${parts[0]}/${parts[1]}`,
      version: parts[2] ?? '0.0.0',
    }
  }

  const parts = StringPrototypeSplit(withoutPeerSuffix, '/')
  return {
    name: parts[0] ?? withoutPeerSuffix,
    version: parts[1] ?? '0.0.0',
  }
}
