/**
 * @file Pure result bucketing. No I/O, no globals.
 *   This is the module that decides whether a run is green, so it is the one
 *   that can silently mask a regression. A failure only counts as expected when
 *   the allowlist names it; a PASS that the allowlist claims should fail is
 *   reported too, because a stale allowlist is how a real failure hides later.
 */

import type { Bucket, RunResult, Summary, Verdict } from './types.mts'

// A trailing slash in an allowlist entry is a marker in THIS file's own format,
// meaning "every test beneath here", not a filesystem path separator. It is
// read once, here, with a character comparison: a path normalizer strips the
// slash, which would turn every directory entry into a dead exact-match.
const SLASH = 47

/**
 * Split an allowlist entry into the id it matches and whether it covers a
 * whole directory.
 */
export function parseAllowlistEntry(entry: string): {
  isDirectory: boolean
  value: string
} {
  const isDirectory = entry.charCodeAt(entry.length - 1) === SLASH
  return { isDirectory, value: isDirectory ? entry.slice(0, -1) : entry }
}

/**
 * True when `entry` covers `id`: an exact match, or a directory entry the id
 * sits beneath.
 */
export function entryCovers(entry: string, id: string): boolean {
  const { isDirectory, value } = parseAllowlistEntry(entry)
  if (!isDirectory) {
    return entry === id
  }
  return (
    id.length > value.length && id.slice(0, value.length + 1) === `${value}/`
  )
}

/**
 * True when `id` is covered by `allowlist`.
 */
export function isAllowed(id: string, allowlist: readonly string[]): boolean {
  for (let i = 0, { length } = allowlist; i < length; i += 1) {
    if (entryCovers(allowlist[i]!, id)) {
      return true
    }
  }
  return false
}

/**
 * Bucket one result against the allowlist.
 */
export function classify(
  result: RunResult,
  allowlist: readonly string[],
): Bucket {
  const allowed = isAllowed(result.id, allowlist)
  if (result.passed) {
    return allowed ? 'now-passing' : 'expected-pass'
  }
  return allowed ? 'expected-fail' : 'unexpected-fail'
}

/**
 * Classify a whole run and find allowlist entries nothing matched.
 *
 * An unmatched entry is reported rather than ignored: it usually means a test
 * was renamed upstream, which would otherwise silently stop being checked.
 */
export function summarize(
  results: readonly RunResult[],
  allowlist: readonly string[],
): Summary {
  const verdicts: Verdict[] = []
  const matched = new Set<string>()
  for (let i = 0, { length } = results; i < length; i += 1) {
    const result = results[i]!
    verdicts.push({
      bucket: classify(result, allowlist),
      id: result.id,
      output: result.output,
    })
    for (let j = 0, entries = allowlist.length; j < entries; j += 1) {
      const entry = allowlist[j]!
      if (entryCovers(entry, result.id)) {
        matched.add(entry)
      }
    }
  }
  const staleAllowlist: string[] = []
  for (let i = 0, { length } = allowlist; i < length; i += 1) {
    const entry = allowlist[i]!
    if (!matched.has(entry)) {
      staleAllowlist.push(entry)
    }
  }
  return { staleAllowlist, verdicts }
}

/**
 * The process exit code for a summary. Non-zero for any unexpected failure, any
 * now-passing test, or any stale allowlist entry: each means the allowlist and
 * reality disagree.
 *
 * An EMPTY run is also non-zero. A runner that walked nothing - an unfetched
 * submodule, a filter that matched no file - would otherwise report success
 * while measuring nothing.
 */
export function exitCodeFor(summary: Summary): number {
  const { staleAllowlist, verdicts } = summary
  if (verdicts.length === 0 || staleAllowlist.length > 0) {
    return 1
  }
  for (let i = 0, { length } = verdicts; i < length; i += 1) {
    const { bucket } = verdicts[i]!
    if (bucket === 'now-passing' || bucket === 'unexpected-fail') {
      return 1
    }
  }
  return 0
}
