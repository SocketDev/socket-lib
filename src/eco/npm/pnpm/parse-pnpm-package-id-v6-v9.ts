/**
 * @file `parsePnpmPackageIdV6V9(pkgId)` — extracts `{ name, version }` from a
 *   pnpm v6/v9 package key. Spec forms handled:
 *
 *   - `name@version` → unscoped
 *   - `@scope/name@version` → scoped (last `@` is the splitter)
 *   - `name@version(peer)` → peer-dep suffix stripped Returns `{ name: pkgId,
 *     version: '0.0.0' }` for unparseable input.
 */

import {
  StringPrototypeIndexOf,
  StringPrototypeLastIndexOf,
  StringPrototypeSlice,
} from '../../../primordials/string'

import type { PnpmPackageId } from './parse-pnpm-package-id-v5'

export function parsePnpmPackageIdV6V9(pkgId: string): PnpmPackageId {
  const parenIdx = StringPrototypeIndexOf(pkgId, '(')
  const withoutPeerSuffix =
    parenIdx !== -1 ? StringPrototypeSlice(pkgId, 0, parenIdx) : pkgId

  if (withoutPeerSuffix[0] === '@') {
    const lastAtIdx = StringPrototypeLastIndexOf(withoutPeerSuffix, '@')
    if (lastAtIdx > 0) {
      return {
        name: StringPrototypeSlice(withoutPeerSuffix, 0, lastAtIdx),
        version: StringPrototypeSlice(withoutPeerSuffix, lastAtIdx + 1),
      }
    }
  } else {
    const atIdx = StringPrototypeIndexOf(withoutPeerSuffix, '@')
    if (atIdx > 0) {
      return {
        name: StringPrototypeSlice(withoutPeerSuffix, 0, atIdx),
        version: StringPrototypeSlice(withoutPeerSuffix, atIdx + 1),
      }
    }
  }
  return { name: pkgId, version: '0.0.0' }
}
