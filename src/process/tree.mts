/**
 * @file Reading the process table as labelled rows, and spotting a wrapper
 *   that has recursed into itself.
 *   A shim that resolves its target through the same PATH it was found on can
 *   exec a binary that IS the shim. Each generation spawns the next, so the
 *   chain grows without bound until memory runs out. Every link has a live
 *   parent, which is why the usual orphan and idle heuristics never see it:
 *   nothing in the chain is orphaned, nothing is idle, and no single process
 *   is large.
 *   The signature is structural. Three consecutive processes carrying the
 *   same label cannot be legitimate, because real nesting always puts a
 *   different program in between (a shim spawns a package manager, which
 *   spawns the shim again). Two levels stay legitimate on purpose: a shim
 *   spawning the real binary behind it is an ordinary pair.
 */

import { getNodeChildProcess } from '../node/child-process.mjs'

export interface ProcessTreeRow {
  command: string
  pid: number
  ppid: number
}

/**
 * The number of consecutive same-label processes that marks a recursion.
 * Two is an ordinary shim-and-binary pair; three cannot be.
 */
export const SELF_NEST_DEPTH = 3

/**
 * Every row that sits at the bottom of a same-label run of `depth`. The
 * deepest links come first, so a caller signalling them in order never
 * reparents a survivor onto init mid-sweep.
 */
export function findSelfNestedProcesses(
  rows: readonly ProcessTreeRow[],
  labelOf: (row: ProcessTreeRow) => string | undefined,
  depth: number = SELF_NEST_DEPTH,
): ProcessTreeRow[] {
  const nested = rows.filter(row =>
    isSelfNestedProcess(rows, row, labelOf, depth),
  )
  const parentOf = new Map<number, number>()
  for (let i = 0, { length } = rows; i < length; i += 1) {
    const row = rows[i]!
    parentOf.set(row.pid, row.ppid)
  }
  const depthOf = new Map<number, number>()
  for (let i = 0, { length } = nested; i < length; i += 1) {
    const { pid } = nested[i]!
    let hops = 0
    let current: number | undefined = pid
    const seen = new Set<number>()
    while (current !== undefined && !seen.has(current)) {
      seen.add(current)
      current = parentOf.get(current)
      hops += 1
    }
    depthOf.set(pid, hops)
  }
  return nested.toSorted((a, b) => depthOf.get(b.pid)! - depthOf.get(a.pid)!)
}

/**
 * Whether `row` sits at the bottom of a run of `depth` consecutive processes
 * that all carry the same label.
 *
 * `labelOf` names the family a row belongs to and returns `undefined` for a
 * row that belongs to none. Rows with no label are never self-nested, so a
 * caller can pass a classifier that recognizes only the wrappers it cares
 * about and ignore everything else.
 */
export function isSelfNestedProcess(
  rows: readonly ProcessTreeRow[],
  row: ProcessTreeRow,
  labelOf: (row: ProcessTreeRow) => string | undefined,
  depth: number = SELF_NEST_DEPTH,
): boolean {
  const label = labelOf(row)
  if (label === undefined) {
    return false
  }
  const rowByPid = new Map<number, ProcessTreeRow>()
  for (let i = 0, { length } = rows; i < length; i += 1) {
    const candidate = rows[i]!
    rowByPid.set(candidate.pid, candidate)
  }
  let current = row
  for (let level = 1; level < depth; level += 1) {
    const parent = rowByPid.get(current.ppid)
    // A cycle in the table would otherwise spin: a parent that is its own
    // ancestor cannot extend a real chain, so stop.
    if (parent === undefined || parent.pid === current.pid) {
      return false
    }
    if (labelOf(parent) !== label) {
      return false
    }
    current = parent
  }
  return true
}

/**
 * Snapshot the POSIX process table as rows of `pid`, `ppid`, and the full
 * command. One `ps` call, parsed once: walking the tree needs the whole table
 * anyway, and re-reading it per-level would let processes move between reads.
 *
 * Returns an empty array when `ps` is unavailable or fails, so a caller sees
 * "nothing to act on" rather than a partial table it might act on wrongly.
 */
export function readProcessTree(): ProcessTreeRow[] {
  const rows: ProcessTreeRow[] = []
  const childProcess = getNodeChildProcess()
  // Synchronous read: callers are cleanup and guard paths where an async
  // spawn would race the very teardown being measured.
  // oxlint-disable-next-line socket/prefer-async-spawn -- sync inspection
  const res = childProcess.spawnSync('ps', ['-Ao', 'pid,ppid,command'], {
    encoding: 'utf8',
    // A full process table on a busy host exceeds the 1 MB default.
    maxBuffer: 16 * 1024 * 1024,
  })
  if (res.status !== 0 || typeof res.stdout !== 'string') {
    return rows
  }
  const lines = res.stdout.split(/\r?\n/)
  for (let i = 0, { length } = lines; i < length; i += 1) {
    // Leading spaces because ps right-aligns the numeric columns. The header
    // row fails to match and is skipped.
    const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(lines[i]!)
    if (match) {
      rows.push({
        command: match[3]!,
        pid: Number(match[1]),
        ppid: Number(match[2]),
      })
    }
  }
  return rows
}
