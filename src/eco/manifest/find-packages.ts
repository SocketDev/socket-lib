/**
 * @file `findPackages(lockfile, pattern)` — returns all `PackageRef`s whose
 *   name matches the regex/string pattern. Pattern length is capped at 256
 *   chars to bound ReDoS amplification against large lockfiles. Both string and
 *   RegExp inputs are hardened via `hardenRegExp` (where available) — matches
 *   socket-btm's smol behavior. Throws:
 *
 *   - `TypeError` — pattern is not a string or RegExp
 *   - `RangeError` — pattern exceeds FIND_PACKAGES_PATTERN_MAX_LEN
 */

import { RangeErrorCtor, TypeErrorCtor } from '../../primordials/error'
import { RegExpCtor, RegExpPrototypeTest } from '../../primordials/regexp'
import { getSmolManifest } from '../../smol/manifest'

import type { PackageRef, ParsedLockfile } from './types'

export const FIND_PACKAGES_PATTERN_MAX_LEN = 256

export function jsFindPackages(
  lockfile: ParsedLockfile,
  pattern: string | RegExp,
): readonly PackageRef[] {
  let regex: RegExp
  if (pattern instanceof RegExpCtor) {
    if (pattern.source.length > FIND_PACKAGES_PATTERN_MAX_LEN) {
      throw new RangeErrorCtor(
        `pattern exceeds maximum length (${FIND_PACKAGES_PATTERN_MAX_LEN})`,
      )
    }
    regex = pattern
  } else {
    if (typeof pattern !== 'string') {
      throw new TypeErrorCtor('pattern must be a string or RegExp')
    }
    if (pattern.length > FIND_PACKAGES_PATTERN_MAX_LEN) {
      throw new RangeErrorCtor(
        `pattern exceeds maximum length (${FIND_PACKAGES_PATTERN_MAX_LEN})`,
      )
    }
    regex = new RegExpCtor(pattern)
  }
  const result: PackageRef[] = []
  const pkgs = lockfile.packages
  for (let i = 0, { length } = pkgs; i < length; i++) {
    const pkg = pkgs[i]!
    if (RegExpPrototypeTest(regex, pkg.name)) {
      result[result.length] = pkg
    }
  }
  return result
}

const _smol = getSmolManifest()

export const findPackages: (
  lockfile: ParsedLockfile,
  pattern: string | RegExp,
) => readonly PackageRef[] = _smol ? _smol.findPackages : jsFindPackages
