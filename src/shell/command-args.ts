/**
 * @file Positional-argument extraction that survives value-taking flags.
 *   Pairs with `shell/parse`, which tokenizes a shell string into an `argv`
 *   array — this operates on that resulting array, downstream of
 *   tokenization.
 *   The naive form — `args.filter(a => !a.startsWith('-'))` — is wrong for
 *   every CLI that has a flag consuming the next token: `gh --repo o/r pr
 *   create` yields `['o/r', 'pr', 'create']`, so a caller checking
 *   `words[0] === 'pr'` silently stops matching. Code is law: the correct
 *   parse lives here once, with the value-flag tables, instead of being
 *   re-derived (and re-broken) per caller.
 */

import { ArrayPrototypePush } from '../primordials/array'
import { SetPrototypeHas } from '../primordials/map-set'
import { StringPrototypeStartsWith } from '../primordials/string'

/**
 * `gh` flags whose NEXT token is a value. Only the ones a caller is
 * plausibly parsing around need listing — an unlisted value flag degrades to
 * the naive behavior, which is what a hand-rolled positional scan already had.
 */
export const GH_VALUE_FLAGS: ReadonlySet<string> = new Set([
  '--assignee',
  '--base',
  '--body',
  '--body-file',
  '--head',
  '--label',
  '--repo',
  '--title',
  '-a',
  '-B',
  '-b',
  '-F',
  '-H',
  '-l',
  '-R',
  '-t',
])

/**
 * `npm` (and `pnpm`/`yarn`) flags whose NEXT token is a value.
 */
export const NPM_VALUE_FLAGS: ReadonlySet<string> = new Set([
  '--access',
  '--otp',
  '--prefix',
  '--registry',
  '--tag',
  '--workspace',
  '-C',
  '-w',
])

/**
 * `git` flags whose NEXT token is a value.
 */
export const GIT_VALUE_FLAGS: ReadonlySet<string> = new Set([
  '--git-dir',
  '--message',
  '--work-tree',
  '-C',
  '-c',
  '-m',
])

/**
 * Positional (non-flag) words from `argv`, skipping value-taking flags AND
 * the token each consumes.
 *
 * `limit` stops the scan early: a caller usually needs only the first one or
 * two words, and stopping keeps a later free-text value (a `--body` that
 * happens to read `pr create`) from being mistaken for a subcommand.
 * `--flag=value` needs no special case — it never consumes a next token.
 *
 * @example
 *   positionalArgs(['--repo', 'o/r', 'pr', 'create'], GH_VALUE_FLAGS)
 *   // → ['pr', 'create']
 *
 *   positionalArgs(['--title=x', 'pr', 'create'], GH_VALUE_FLAGS, 1)
 *   // → ['pr']
 *
 *   positionalArgs(['commit', '--', '-m'], GIT_VALUE_FLAGS)
 *   // → ['commit', '-m']
 */
export function positionalArgs(
  argv: readonly string[],
  valueFlags: ReadonlySet<string>,
  limit = Number.POSITIVE_INFINITY,
): string[] {
  const words: string[] = []
  for (let i = 0, { length } = argv; i < length; i += 1) {
    const arg = argv[i]
    if (arg === undefined) {
      continue
    }
    // `--` ends option parsing; everything after is positional.
    if (arg === '--') {
      for (let j = i + 1; j < length && words.length < limit; j += 1) {
        const rest = argv[j]
        if (rest !== undefined) {
          ArrayPrototypePush(words, rest)
        }
      }
      break
    }
    if (SetPrototypeHas(valueFlags, arg)) {
      i += 1
      continue
    }
    if (StringPrototypeStartsWith(arg, '-')) {
      continue
    }
    ArrayPrototypePush(words, arg)
    if (words.length >= limit) {
      break
    }
  }
  return words
}
