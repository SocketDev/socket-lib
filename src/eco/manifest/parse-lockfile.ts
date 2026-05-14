/**
 * @fileoverview `parseLockfile(content, ecosystem, format?)` —
 * dispatches to the right per-PM lockfile parser. When `format` is
 * omitted, the content is sniffed (npm `lockfileVersion`, yarn
 * `__metadata:` or `yarn lockfile`, pnpm `lockfileVersion:`).
 *
 * On socket-btm's smol Node binary this routes to
 * `node:smol-manifest`'s native `parseLockfile`; on stock Node it
 * dispatches to one of the `src/eco/npm/<pm>/parse-lockfile.ts`
 * leaves.
 *
 * Throws `ManifestError(ERR_UNSUPPORTED)` for unrecognized
 * ecosystems, and `ManifestError(ERR_UNKNOWN_FORMAT)` when content
 * can't be sniffed.
 */

import { ManifestError } from './manifest-error'
import { parseCargoLock } from '../cargo/parse-lockfile'
import { parsePackageLock } from '../npm/npm/parse-lockfile'
import { parsePnpmLock } from '../npm/pnpm/parse-lockfile'
import { parseYarnLock } from '../npm/yarnpkg/yarn/parse-lockfile'
import { StringPrototypeIndexOf } from '../../primordials/string'
import { getSmolManifest } from '../../smol/manifest'

import type { ParsedLockfile } from './types'
import type { EcosystemString } from '../purl'

export type LockfileFormat = 'npm' | 'yarn' | 'pnpm' | 'composer' | 'cargo'

export function jsParseLockfile(
  content: string,
  ecosystem: EcosystemString,
  format?: LockfileFormat | undefined,
): ParsedLockfile {
  if (ecosystem === 'cargo') {
    return parseCargoLock(content)
  }
  if (ecosystem !== 'npm') {
    throw new ManifestError(
      `Unsupported ecosystem: ${ecosystem}`,
      'ERR_UNSUPPORTED',
    )
  }
  const fmt = format ?? sniffLockfileFormat(content)
  switch (fmt) {
    case 'npm':
      return parsePackageLock(content)
    case 'yarn':
      return parseYarnLock(content)
    case 'pnpm':
      return parsePnpmLock(content)
    case 'cargo':
      return parseCargoLock(content)
    default:
      throw new ManifestError(
        'Unable to detect lockfile format',
        'ERR_UNKNOWN_FORMAT',
      )
  }
}

export function sniffLockfileFormat(
  content: string,
): LockfileFormat | undefined {
  if (StringPrototypeIndexOf(content, '"lockfileVersion"') !== -1) {
    return 'npm'
  }
  if (
    StringPrototypeIndexOf(content, 'yarn lockfile') !== -1 ||
    StringPrototypeIndexOf(content, '__metadata:') !== -1
  ) {
    return 'yarn'
  }
  if (StringPrototypeIndexOf(content, 'lockfileVersion:') !== -1) {
    return 'pnpm'
  }
  return undefined
}

const _smol = getSmolManifest()

export const parseLockfile: (
  content: string,
  ecosystem: EcosystemString,
  format?: LockfileFormat | undefined,
) => ParsedLockfile = _smol
  ? /* c8 ignore start - smol Node binary only. */
    (
      content: string,
      ecosystem: EcosystemString,
      format?: LockfileFormat | undefined,
    ) => {
      // smol-manifest doesn't ship a cargo parser; route there only.
      if (ecosystem === 'cargo' || format === 'cargo') {
        return jsParseLockfile(content, ecosystem, format)
      }
      return _smol.parseLockfile(
        content,
        ecosystem,
        format as 'npm' | 'yarn' | 'pnpm' | 'composer' | undefined,
      ) as ParsedLockfile
    }
  : /* c8 ignore stop */
    jsParseLockfile
