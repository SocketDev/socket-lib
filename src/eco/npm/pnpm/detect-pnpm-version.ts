/**
 * @fileoverview `detectPnpmVersion(content)` — scans a pnpm-lock.yaml
 * for its `lockfileVersion:` line and returns `5`, `6`, or `9`. Falls
 * back to `9` (the latest) when no recognizable marker is present.
 *
 * Matches socket-btm's smol-manifest internal `detectPnpmVersion`.
 */

import { RegExpPrototypeExec } from '../../../primordials/regexp'

const RE_LOCKFILE_VERSION = /lockfileVersion:\s*['"]?([0-9.]+)['"]?/

export function detectPnpmVersion(content: string): 5 | 6 | 9 {
  const match = RegExpPrototypeExec(RE_LOCKFILE_VERSION, content)
  if (match) {
    const version = match[1]!
    if (version[0] === '5') {
      return 5
    }
    if (version[0] === '6') {
      return 6
    }
    if (version[0] === '9') {
      return 9
    }
  }
  return 9
}
