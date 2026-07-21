/**
 * @file Tokenize a shell-style command string into an argv array. Delegates to
 *   the vendored `shell-quote` parser and flattens its output to bare-string
 *   tokens — operators (`&&`, `|`, `;`, …), comments (`# …`), and glob tokens
 *   are dropped, leaving only the words a `child_process.spawn` /
 *   `execFileSync` call would receive. Unlike `shell/parse` (which preserves
 *   that structure), this is purpose-built for "turn a command string into
 *   argv". Single + double quotes, backslash escapes, and `key="value"` mixed
 *   tokens are honored per POSIX `sh`; `$VAR` references collapse to an empty
 *   string (shell-quote resolves them against an env, and none is supplied
 *   here). Common use case: turning a `string` representation of a command
 *   (e.g. from a config file, a `bin` field, or a shellout test fixture) into
 *   an argv array that `execFileSync` / `child_process.spawn` accepts directly
 *   — bypassing the platform shell + its quoting differences (`cmd.exe` vs
 *   `bash`).
 */

import { ArrayPrototypeFilter } from '../primordials/array'
import { StringPrototypeSplit } from '../primordials/string'
import { parse as shellParse } from '../external/shell-quote'

/**
 * Tokenize a shell-style command string into argv. Single + double quote pairs
 * are recognized and stripped; whitespace outside quotes separates tokens.
 * Operators and comments are dropped (use `shell/parse` to keep them).
 *
 * @example
 *   parseArgsString('git commit -m "hello world"')
 *   // → ['git', 'commit', '-m', 'hello world']
 *
 *   parseArgsString('foo --bar="x y" baz')
 *   // → ['foo', '--bar=x y', 'baz']
 *
 *   parseArgsString("echo 'one two' three")
 *   // → ['echo', 'one two', 'three']
 */
export function parseArgsString(cmd: string): string[] {
  let entries: ReturnType<typeof shellParse>
  try {
    entries = shellParse(cmd)
  } catch {
    // The vendored shell-quote parser THROWS on a malformed `${...}`
    // substitution ("Bad substitution" — e.g. `${`, `${}`, `${x`). This
    // tokenizer's contract is to turn ANY command string into argv, so degrade
    // to a naive whitespace split rather than propagate: pathological input
    // still yields usable tokens instead of crashing the caller.
    return ArrayPrototypeFilter(StringPrototypeSplit(cmd, /\s+/), Boolean)
  }
  const argv: string[] = []
  for (const entry of entries) {
    if (typeof entry === 'string') {
      argv.push(entry)
    }
  }
  return argv
}
