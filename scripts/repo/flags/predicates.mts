/**
 * @file Local argv flag predicates for the scripts that BUILD this library.
 *   These scripts cannot import predicates from the library they produce.
 *   `@socketsecurity/lib-stable` resolves to the previously PUBLISHED version,
 *   and a leaf this working tree adds is stubbed there until the next release
 *   ships - which is the release these scripts produce. A stubbed export
 *   resolves fine and THROWS when called, so the type gate never sees it.
 *   Importing `src/` instead does not work either: those sources name `.mjs`
 *   specifiers the build itself emits.
 *   Mirrors the library's own argv flag predicates for what the build
 *   path needs. Every other consumer keeps using `exe/argv/flag-predicates`.
 */

import process from 'node:process'

export type FlagInput = readonly string[] | Record<string, unknown> | undefined

/**
 * Build a predicate over argv forms and object keys, matching the shape of the
 * library's own `makeFlagPredicate`: no input reads `process.argv`, an array
 * matches the argv forms, and an object matches any of the keys truthily.
 */
function makeFlagPredicate(
  argvForms: readonly string[],
  keys: readonly string[],
): (input?: FlagInput | undefined) => boolean {
  return function check(input?: FlagInput | undefined): boolean {
    if (!input) {
      return argvForms.some(f => process.argv.includes(f))
    }
    if (Array.isArray(input)) {
      return argvForms.some(f => (input as readonly string[]).includes(f))
    }
    return keys.some(k => !!(input as Record<string, unknown>)[k])
  }
}

export const isJson = makeFlagPredicate(['--json'], ['json'])

export const isQuiet = makeFlagPredicate(
  ['--quiet', '--silent'],
  ['quiet', 'silent'],
)
