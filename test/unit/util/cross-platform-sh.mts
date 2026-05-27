/**
 * @file Cross-platform shell-out helper for tests that need to drive real git
 *   operations. `execSync(cmd)` defaults to `cmd.exe` on Windows, which parses
 *   quoting differently from bash/zsh on macOS + Linux. This helper tokenizes
 *   the command line with the lib's own `shell/parse` and forwards to
 *   `execFileSync` (no shell) so behavior is identical across darwin / linux /
 *   win32. `&&` chains split at the parsed operator boundary rather than a
 *   naive string split, so a literal `&&` inside a quoted arg stays intact.
 */

import { execFileSync } from 'node:child_process'

import { parseShell } from '../../../src/shell/parse'

/**
 * Run a command line. Splits on `&&` operators and execs each segment via
 * `execFileSync` (no shell). Returns the trimmed stdout of the last segment.
 */
export function sh(cwd: string, cmd: string): string {
  // Group parsed tokens into segments at each `&&` operator. Operators surface
  // as `{ op }` objects; bare-string tokens are the argv words.
  const segments: string[][] = [[]]
  for (const entry of parseShell(cmd)) {
    if (typeof entry === 'string') {
      segments[segments.length - 1]!.push(entry)
    } else if ('op' in entry && entry.op === '&&') {
      segments.push([])
    }
  }
  let out = ''
  for (const argv of segments) {
    const file = argv[0]
    if (!file) {
      throw new Error(`sh: empty command segment in: ${cmd}`)
    }
    out = execFileSync(file, argv.slice(1), {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  }
  return out.trim()
}
