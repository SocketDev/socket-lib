/**
 * @fileoverview `readBazelVersionFile(workspaceDir)` — walks up from
 * `workspaceDir` looking for a `.bazelversion` file (the
 * Bazel/Bazelisk convention for pinning the project's Bazel version).
 *
 * Returns the trimmed contents as a version string, or `undefined`
 * when no file is found before reaching the filesystem root. The
 * walk respects the "first `.bazelversion` wins" convention used by
 * Bazelisk itself.
 *
 * Some special values that `.bazelversion` can hold (`latest`,
 * `last_green`, `rolling`, etc.) are returned verbatim; resolution
 * of those into concrete X.Y.Z versions is the orchestrator's job.
 */

import path from 'node:path'

import { safeReadFile } from '../../fs/read-file'
import {
  StringPrototypeIndexOf,
  StringPrototypeSlice,
  StringPrototypeTrim,
} from '../../primordials/string'

const BAZEL_VERSION_FILE = '.bazelversion'

export async function readBazelVersionFile(
  startDir: string,
): Promise<string | undefined> {
  let current = path.resolve(startDir)
  while (true) {
    const candidate = path.join(current, BAZEL_VERSION_FILE)
    // eslint-disable-next-line no-await-in-loop
    const content = await safeReadFile(candidate, { encoding: 'utf8' })
    if (content !== undefined) {
      // Strip comments (anything after `#` on a line) + trim.
      const hashIdx = StringPrototypeIndexOf(content, '#')
      const base =
        hashIdx === -1 ? content : StringPrototypeSlice(content, 0, hashIdx)
      const version = StringPrototypeTrim(base)
      return version.length > 0 ? version : undefined
    }
    const parent = path.dirname(current)
    if (parent === current) {
      return undefined
    }
    current = parent
  }
}
