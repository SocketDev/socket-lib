/**
 * @file `getPackage(lockfile, name)` — O(1) lookup of the first matching
 *   `PackageRef` by name in a `ParsedLockfile`. Returns `undefined` when no
 *   match exists. For multi-version names (where `_index[name]` is an array of
 *   indices), returns the first occurrence. Use `getPackageVersions` to get all
 *   of them.
 */

import { getSmolManifest } from '../../smol/manifest'

import type { PackageRef, ParsedLockfile } from './types'

export function jsGetPackage(
  lockfile: ParsedLockfile,
  name: string,
): PackageRef | undefined {
  const idx = lockfile._index[name]
  if (idx === undefined) {
    return undefined
  }
  if (typeof idx === 'number') {
    return lockfile.packages[idx]
  }
  return lockfile.packages[idx[0]!]
}

const smol = getSmolManifest()

export const getPackage: (
  lockfile: ParsedLockfile,
  name: string,
) => PackageRef | undefined = smol ? smol.getPackage : jsGetPackage
