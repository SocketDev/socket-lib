/**
 * @file `parseLockfile(content, ecosystem, format?)` — dispatches to the right
 *   per-PM lockfile parser. When `format` is omitted, the content is sniffed
 *   (npm `lockfileVersion`, yarn `__metadata:` or `yarn lockfile`, pnpm
 *   `lockfileVersion:`). On socket-btm's smol Node binary this routes to
 *   `node:smol-manifest`'s native `parseLockfile`; on stock Node it dispatches
 *   to one of the `src/eco/npm/<pm>/lockfile/parse.ts` leaves. Throws
 *   `ManifestError(ERR_UNSUPPORTED)` for unrecognized ecosystems, and
 *   `ManifestError(ERR_UNKNOWN_FORMAT)` when content can't be sniffed.
 */

import { ManifestError } from './manifest-error.mjs'
import { parseCargoLock } from '../cargo/parse-lockfile.mjs'
import { parsePackageLock } from '../npm/npm-cli/lockfile/parse.mjs'
import { jsParseBunLock } from '../npm/bun/lockfile/parse.mjs'
import { parsePnpmLock } from '../npm/pnpm/lockfile/parse.mjs'
import { jsParseVltLock } from '../npm/vlt/lockfile/parse.mjs'
import { parseYarnLock } from '../npm/yarn/lockfile/parse.mjs'
import { StringPrototypeIndexOf } from '../../primordials/string.mjs'
import { getSmolManifest } from '../../exe/smol/manifest.mjs'

import type { ParsedLockfile } from './types.mjs'
import type { EcosystemString } from '../purl.mjs'

export type LockfileFormat =
  | 'npm'
  | 'yarn'
  | 'pnpm'
  | 'bun'
  | 'vlt'
  | 'composer'
  | 'cargo'

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
    case 'bun':
      return jsParseBunLock(content)
    case 'vlt':
      return jsParseVltLock(content)
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
    // bun.lock and vlt-lock.json carry the same key, so they are ruled out
    // first; otherwise both parse as npm and yield garbage.
    if (StringPrototypeIndexOf(content, '"configVersion"') !== -1) {
      return 'bun'
    }
    if (
      StringPrototypeIndexOf(content, '"nodes"') !== -1 &&
      StringPrototypeIndexOf(content, '"edges"') !== -1
    ) {
      return 'vlt'
    }
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

const smol = getSmolManifest()

export const parseLockfile: (
  content: string,
  ecosystem: EcosystemString,
  format?: LockfileFormat | undefined,
) => ParsedLockfile = smol
  ? /* c8 ignore start - smol Node binary only. */
    (
      content: string,
      ecosystem: EcosystemString,
      format?: LockfileFormat | undefined,
    ) =>
      smol.parseLockfile(
        content,
        ecosystem,
        format as 'npm' | 'yarn' | 'pnpm' | 'composer' | 'cargo' | undefined,
      ) as ParsedLockfile
  : /* c8 ignore stop */
    jsParseLockfile
