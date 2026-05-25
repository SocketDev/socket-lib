/**
 * @file Tokenize a shell-style command string into an argv array. Modernized
 *   port of the `string-argv` npm package (MIT) — same regex-driven recognizer,
 *   native ES module shape, typed signature, no env/file prepend baggage.
 *   Supports bare tokens, single + double quoted tokens, and mixed tokens like
 *   `key="value"`. No backslash-escape processing — `\"` inside a double-quoted
 *   segment is two literal characters, not an escaped quote. No env-var
 *   expansion, no command substitution, no pipes / redirects / `&&` chains;
 *   this is purely a tokenizer. Common use case: turning a `string`
 *   representation of a command (e.g. from a config file, a `bin` field, or a
 *   shellout test fixture) into an argv array that `execFileSync` /
 *   `child_process.spawn` accepts directly — bypassing the platform shell + its
 *   quoting differences (`cmd.exe` vs `bash`).
 */

// (a) `[^\s'"]([^\s'"]*(['"])([^]*?)\3)+[^\s'"]*` — mixed token
//     containing quoted segments, ending at first whitespace outside
//     the quotes. E.g. `--msg="hello world"`.
// (b) `[^\s'"]+` — bare token, no quotes.
// (c) `(['"])([^]*?)\5` — fully-quoted token; the inner content is
//     captured in group 6 (or 4 for the mixed-token branch).
const TOKEN_REGEXP =
  /([^\s'"]([^\s'"]*(['"])([^]*?)\3)+[^\s'"]*)|[^\s'"]+|(['"])([^]*?)\5/g

/**
 * Tokenize a shell-style command string into argv. Single + double quote pairs
 * are recognized; the quote characters are stripped from the resulting token.
 * Whitespace outside of quotes separates tokens.
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
  const argv: string[] = []
  let match: RegExpExecArray | null
  // RegExp with /g must have lastIndex reset between calls — otherwise
  // a shared module-level regex carries state across invocations.
  TOKEN_REGEXP.lastIndex = 0
  while ((match = TOKEN_REGEXP.exec(cmd)) !== null) {
    // Group 1 (mixed): outer match for tokens like `key="value"`.
    // Group 6 (pure-quoted inner): bare contents of `"..."` / `'...'`.
    // match[0] (bare): unquoted token.
    const token = match[1] ?? match[6] ?? match[0]
    if (typeof token === 'string') {
      argv.push(token)
    }
  }
  return argv
}
