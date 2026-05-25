/**
 * @file Cross-platform shell-out helper for tests that need to drive real git
 *   operations. `execSync(cmd)` defaults to `cmd.exe` on Windows, which parses
 *   quoting differently from bash/zsh on macOS + Linux. This helper tokenizes
 *   the command line and forwards to `execFileSync` (no shell) so behavior is
 *   identical across darwin / linux / win32. Duplicates the tokenizer from
 *   `src/argv/parse-args-string.ts` — this is the duplicate-until-published
 *   version. Once v6.0.1 ships with the new export, switch tests to `import {
 *   parseArgsString } from '../../../src/argv/parse-args-string.mts'` and
 *   delete this file. See `git log -S "parseArgsString" src/argv/`.
 */

import { execFileSync } from 'node:child_process'

const TOKEN_REGEXP =
  /([^\s'"]([^\s'"]*(['"])([^]*?)\3)+[^\s'"]*)|[^\s'"]+|(['"])([^]*?)\5/g

function parseArgsString(cmd: string): string[] {
  const argv: string[] = []
  let match: RegExpExecArray | null
  TOKEN_REGEXP.lastIndex = 0
  while ((match = TOKEN_REGEXP.exec(cmd)) !== null) {
    const token = match[1] ?? match[6] ?? match[0]
    if (typeof token === 'string') {
      argv.push(token)
    }
  }
  return argv
}

/**
 * Run a command line. Splits on `&&` and execs each segment via `execFileSync`
 * (no shell). Returns the trimmed stdout of the last segment.
 */
export function sh(cwd: string, cmd: string): string {
  const segments = cmd.split('&&').map(s => s.trim())
  let out = ''
  for (const segment of segments) {
    const argv = parseArgsString(segment)
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
