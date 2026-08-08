/**
 * @file Pure parser for `git status --porcelain` output. Takes the porcelain
 *   TEXT — callers own the spawn (`getChangedFiles` and friends in this
 *   package, or any one-shot status read) and hand the UNTRIMMED stdout here.
 *   Untrimmed matters: porcelain encodes the staged/unstaged state in the
 *   first two columns, and the unstaged form starts with a space (` M path`),
 *   so a trimmed read shifts every parsed field left by one char and corrupts
 *   the result. Rename entries (`R  old -> new`) resolve to the NEW path.
 */

import { splitLines } from '../strings/lines'

export interface PorcelainEntry {
  /**
   * Two-char porcelain status (e.g. `' M'`, `'??'`, `'R '`).
   */
  readonly status: string
  /**
   * Repo-relative path (rename entries resolve to the NEW path).
   */
  readonly path: string
}

/**
 * Parse the untrimmed output of `git status --porcelain` into discrete
 * entries. Rename entries (`R old -> new`) resolve to the NEW path. Pure; no
 * I/O.
 *
 * The two-char status at columns 0–1 is preserved verbatim. Example inputs:
 * ` M src/foo.mts`   → `{ status: ' M', path: 'src/foo.mts' }`
 * `?? scripts/x.mts` → `{ status: '??', path: 'scripts/x.mts' }`
 * `R  old.mts -> new.mts` → `{ status: 'R ', path: 'new.mts' }`
 */
export function parsePorcelain(out: string): PorcelainEntry[] {
  const entries: PorcelainEntry[] = []
  for (const line of splitLines(out)) {
    if (!line) {
      continue
    }
    const status = line.slice(0, 2)
    const rest = line.slice(3)
    const arrow = rest.indexOf(' -> ')
    const filePath = arrow === -1 ? rest : rest.slice(arrow + 4)
    entries.push({ status, path: filePath })
  }
  return entries
}
