/**
 * @fileoverview `getPackageVersions(lockfile, name)` — returns all
 * `PackageRef`s that match the given name in a `ParsedLockfile`.
 * Returns an empty array when no match exists.
 */

import { getSmolManifest } from '../../smol/manifest'

import type { PackageRef, ParsedLockfile } from './types'

export function jsGetPackageVersions(
  lockfile: ParsedLockfile,
  name: string,
): readonly PackageRef[] {
  const idx = lockfile._index[name]
  if (idx === undefined) {
    return []
  }
  if (typeof idx === 'number') {
    const pkg = lockfile.packages[idx]
    return pkg ? [pkg] : []
  }
  const result: PackageRef[] = []
  for (let i = 0, { length } = idx; i < length; i++) {
    const pkg = lockfile.packages[idx[i]!]
    if (pkg) {
      result[result.length] = pkg
    }
  }
  return result
}

const _smol = getSmolManifest()

export const getPackageVersions: (
  lockfile: ParsedLockfile,
  name: string,
) => readonly PackageRef[] = _smol
  ? _smol.getPackageVersions
  : jsGetPackageVersions
