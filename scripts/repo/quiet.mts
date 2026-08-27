/**
 * @file Local `--quiet` / `--silent` detection for the build scripts.
 *   These scripts BUILD this library, so they cannot import a predicate from
 *   it. `@socketsecurity/lib-stable` resolves to the previously PUBLISHED
 *   version, and a leaf this working tree adds is stubbed there until the next
 *   release ships - which is the release these scripts produce. Importing
 *   `src/` directly does not work either: those sources name `.mjs`
 *   specifiers the build itself emits. So the bootstrap-critical path keeps
 *   its own copy, and every other consumer keeps using
 *   `exe/argv/flag-predicates`.
 */

import process from 'node:process'

const QUIET_FLAGS = ['--quiet', '--silent']

/**
 * True when quiet mode is requested, either through a parsed flag bag or the
 * raw argv. Mirrors `exe/argv/flag-predicates` `isQuiet` for the two forms the
 * build scripts pass.
 */
export function isQuiet(
  input?: readonly string[] | { quiet?: boolean | undefined } | undefined,
): boolean {
  if (input === undefined) {
    return process.argv.some(arg => QUIET_FLAGS.includes(arg))
  }
  if (Array.isArray(input)) {
    return input.some(arg => QUIET_FLAGS.includes(arg))
  }
  return (input as { quiet?: boolean | undefined }).quiet === true
}
