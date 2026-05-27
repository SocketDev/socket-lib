/**
 * @file Escape an argv array into a single shell-safe command string. Wraps the
 *   vendored `shell-quote`. Use when building a command line for display, a log
 *   line, or a copy-pasteable reproduction — the inverse of `parseShell`. The
 *   output targets POSIX `sh` quoting, not `cmd.exe`; spawn callers should pass
 *   an argv array to `child_process.spawn` directly rather than quoting into a
 *   shell string.
 */

import { quote as shellQuote } from '../external/shell-quote'

/**
 * Escape an array of arguments into a shell-safe command string.
 *
 * @example
 *   quote(['git', 'commit', '-m', 'hello world'])
 *   // → "git commit -m 'hello world'"
 *
 *   quote(['echo', '$HOME'])
 *   // → "echo \\$HOME"
 */
export function quote(argv: readonly string[]): string {
  return shellQuote(argv)
}
