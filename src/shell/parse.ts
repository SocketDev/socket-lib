/**
 * @file Tokenize a shell command line into typed entries (bare strings,
 *   operators, comments, globs). Wraps the vendored `shell-quote`. Unlike
 *   `argv/parse-args-string` (which flattens to a plain `string[]` for
 *   `child_process.spawn`), this preserves shell structure — operator tokens
 *   like `&&` / `|` / `;` surface as `{ op }`, comments as `{ comment }` — so a
 *   caller can reason about command boundaries. `$VAR` references resolve
 *   against `env`; unresolved ones collapse to an empty string.
 */

import { parse as shellParse } from '../external/shell-quote'

import type { ParseEntry } from '../external/shell-quote'

export type {
  ParseEntry,
  ShellComment,
  ShellGlob,
  ShellOp,
} from '../external/shell-quote'

/**
 * Tokenize `cmd` into `ParseEntry` items, preserving operators and comments.
 * Throws on unterminated quotes.
 *
 * @example
 *   parseShell('git commit -m "hello world"')
 *   // → ['git', 'commit', '-m', 'hello world']
 *
 *   parseShell('ls && echo done')
 *   // → ['ls', { op: '&&' }, 'echo', 'done']
 *
 *   parseShell('echo $HOME', { HOME: '/root' })
 *   // → ['echo', '/root']
 */
export function parseShell(
  cmd: string,
  env?:
    | Record<string, string>
    | ((key: string) => string | undefined)
    | undefined,
): ParseEntry[] {
  return shellParse(cmd, env)
}
