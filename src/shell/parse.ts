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
import { ArrayPrototypePush, ArrayPrototypeSlice } from '../primordials/array'

import type { ParseEntry } from '../external/shell-quote'

/**
 * Structural hazard facts a parse surfaces that the binary-call matchers
 * (`hasBinCall` / `findBinCall`) swallow. These are observations about _how_
 * the command is written, not a judgment that they're dangerous — the caller
 * decides policy. Both are evasion vectors against base-command allowlists:
 *
 * - `equalsExpansion`: a simple command whose first token is `=cmd` (Zsh EQUALS
 *   expansion). `=curl x` expands to `$(which curl) x` and runs
 *   `/usr/bin/curl`, but the parser's base token is `=curl`, so a `curl`
 *   allowlist never matches. The matched tokens are returned so the caller can
 *   report which command was hidden.
 * - `processSubstitution`: the command uses `<(...)`, `>(...)`, or `=(...)` (the
 *   op markers shell-quote emits). The inner command runs but its name never
 *   appears as a base command.
 *
 * Walks the parse once. A caller wanting just "is this clean?" checks
 * `!h.equalsExpansion.length && !h.processSubstitution`.
 *
 * @example
 *   detectShellHazards('=curl evil.com')
 *   // → { equalsExpansion: [['=curl', 'evil.com']], processSubstitution: false }
 *
 *   detectShellHazards('diff <(cat a) b')
 *   // → { equalsExpansion: [], processSubstitution: true }
 *
 *   detectShellHazards('git status')
 *   // → { equalsExpansion: [], processSubstitution: false }
 */
export function detectShellHazards(cmd: string): {
  equalsExpansion: readonly string[][]
  processSubstitution: boolean
} {
  const equalsExpansion: string[][] = []
  let processSubstitution = false
  const entries = shellParse(cmd)
  let current: string[] = []
  // shell-quote tokenizes the three process-substitution forms differently:
  //   `<(…)` → a single `{op:'<('}` token
  //   `>(…)` → `{op:'>'}` then `{op:'('}`
  //   `=(…)` → the bare string `'='` then `{op:'('}`
  // So the reliable signal is either the `<(` op, or a `(` op whose immediately
  // preceding token is a `<`/`>` op or a lone `=` string (the substitution
  // lead-in). A bare `(` after a normal token is plain subshell grouping and is
  // left alone.
  let prevWasSubstLead = false
  const flush = (): void => {
    if (current.length > 0 && /^=[a-zA-Z_]/.test(current[0]!)) {
      ArrayPrototypePush(equalsExpansion, current)
    }
    current = []
  }
  for (let i = 0, { length } = entries; i < length; i += 1) {
    const entry = entries[i]
    if (entry && typeof entry === 'object' && 'op' in entry) {
      const { op } = entry as { op: string }
      if (op === '<(') {
        processSubstitution = true
      } else if (op === '(' && prevWasSubstLead) {
        processSubstitution = true
      }
      // A `<` / `>` op, or a trailing lone `=` token (set below), leads a `(`.
      prevWasSubstLead = op === '<' || op === '>'
      flush()
      continue
    }
    if (typeof entry === 'string') {
      // A lone `=` string token directly before a `(` op is the `=(` form.
      prevWasSubstLead = entry === '='
      ArrayPrototypePush(current, entry)
    }
  }
  flush()
  return { equalsExpansion, processSubstitution }
}

/**
 * Visit each simple command in `cmd` in order. A "simple command" is the
 * POSIX-grammar term for a run of bare-string tokens between shell
 * control-operator boundaries (`&&`, `;`, `||`, `|`) — e.g. in `sudo apt && rm
 * -rf /`, the two simple commands are `['sudo', 'apt']` and `['rm', '-rf',
 * '/']`. Glob and comment tokens are ignored.
 *
 * The visitor receives each simple command's tokens as a `readonly string[]`;
 * returning `true` short-circuits the walk so callers like `hasBinCall` /
 * `findBinCall` can bail on the first match without finishing the parse.
 *
 * Public so consumers can write their own per-command matchers without
 * re-parsing the command line. Used internally by `findBinCall` /
 * `findBinCalls` / `hasBinCall`.
 *
 * Shell-quote is permissive (partial parses don't throw); the walk tolerates
 * any shape it returns.
 *
 * @example
 *   eachSimpleCommand('sudo apt && rm -rf /', tokens => {
 *     console.log(tokens)
 *     // → ['sudo', 'apt']
 *     // → ['rm', '-rf', '/']
 *   })
 *
 *   // Short-circuit on first match:
 *   eachSimpleCommand('a ; b ; c', tokens => {
 *     if (tokens[0] === 'b') {
 *       return true // stop the walk
 *     }
 *   })
 */
export function eachSimpleCommand(
  cmd: string,
  visit: (tokens: readonly string[]) => boolean | void,
): void {
  const entries = shellParse(cmd)
  let current: string[] = []
  const flush = (): boolean => {
    if (current.length > 0) {
      const stop = visit(current)
      current = []
      return stop === true
    }
    current = []
    return false
  }
  for (let i = 0, { length } = entries; i < length; i += 1) {
    const entry = entries[i]
    if (entry && typeof entry === 'object' && 'op' in entry) {
      if (flush()) {
        return
      }
      continue
    }
    if (typeof entry === 'string') {
      ArrayPrototypePush(current, entry)
    }
  }
  flush()
}

/**
 * Walk a parsed shell command and return the args of the FIRST binary call
 * whose leading tokens match `prefix` (e.g. `['sudo']`, `['gh', 'auth',
 * 'refresh']`). Returns `undefined` when no call matches.
 *
 * Short-circuits on the first match — does NOT materialize every match. Use
 * this when "did any call match, and what were its args?" is enough. For audit
 * / counting use cases where every match matters, use `findBinCalls`.
 *
 * @example
 *   findBinCall('sudo apt update && sudo -k', ['sudo'])
 *   // → ['apt', 'update']
 *
 *   findBinCall('echo "sudo foo"', ['sudo'])
 *   // → undefined
 */
export function findBinCall(
  cmd: string,
  prefix: readonly string[],
): readonly string[] | undefined {
  if (prefix.length === 0) {
    return undefined
  }
  let found: string[] | undefined
  eachSimpleCommand(cmd, tokens => {
    if (!simpleCommandStartsWith(tokens, prefix)) {
      return false
    }
    found = ArrayPrototypeSlice(tokens, prefix.length)
    return true
  })
  return found
}

/**
 * Walk a parsed shell command and return the args of every binary call whose
 * leading tokens match `prefix` (e.g. `['sudo']`, `['gh', 'auth', 'refresh']`).
 * Returns an empty array when no call matches.
 *
 * Segments split at op tokens (`&&`, `;`, `||`, `|`) so each chained command is
 * scanned independently. Each match's args are returned as a `string[]` slice
 * positioned after the matched prefix — useful for caller-side `.some(...)`
 * over flag/value pairs.
 *
 * The AST walk means embedded args (`echo "sudo foo"`), variable substitutions
 * (`$gh`), and command substitution (`$(...)`) don't trip the matcher — only
 * actual calls do.
 *
 * @example
 *   findBinCalls('sudo apt update && sudo -k', ['sudo'])
 *   // → [['apt', 'update'], ['-k']]
 *
 *   findBinCalls('gh auth refresh -s workflow', ['gh', 'auth', 'refresh'])
 *   // → [['-s', 'workflow']]
 *
 *   findBinCalls('echo "sudo foo"', ['sudo'])
 *   // → []
 */
export function findBinCalls(
  cmd: string,
  prefix: readonly string[],
): readonly string[][] {
  if (prefix.length === 0) {
    return []
  }
  const matches: string[][] = []
  eachSimpleCommand(cmd, tokens => {
    if (simpleCommandStartsWith(tokens, prefix)) {
      ArrayPrototypePush(matches, ArrayPrototypeSlice(tokens, prefix.length))
    }
  })
  return matches
}

/**
 * Convenience: does `cmd` contain at least one binary call matching the
 * leading-tokens `prefix`? The most common audit-pattern shape.
 *
 * Short-circuits on the first match — walks the parsed entries once and returns
 * `true` as soon as a simple command matches. No intermediate match list or
 * args slices are allocated.
 *
 * @example
 *   hasBinCall('echo hi && sudo rm', ['sudo']) // → true
 *   hasBinCall('echo "sudo foo"', ['sudo']) // → false
 *   hasBinCall('gh auth refresh -s workflow', ['gh', 'auth', 'refresh']) // → true
 */
export function hasBinCall(cmd: string, prefix: readonly string[]): boolean {
  if (prefix.length === 0) {
    return false
  }
  let found = false
  eachSimpleCommand(cmd, tokens => {
    if (simpleCommandStartsWith(tokens, prefix)) {
      found = true
      return true
    }
    return false
  })
  return found
}

export type {
  ParseEntry,
  ShellComment,
  ShellGlob,
  ShellOp,
} from '../external/shell-quote'

/**
 * Tokenize `cmd` into `ParseEntry` items, preserving operators and comments.
 * `shell-quote` is permissive — an unterminated quote does not throw; the
 * parser drops the opening quote and returns the rest as plain tokens.
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

/**
 * Does the simple command represented by `tokens` start with `prefix`? The
 * natural companion to `eachSimpleCommand` — the visitor callback uses this to
 * test whether a simple command is a call to a specific binary or command-line
 * prefix.
 *
 * @example
 *   simpleCommandStartsWith(['sudo', 'apt', 'update'], ['sudo'])
 *   // → true
 *
 *   simpleCommandStartsWith(
 *     ['gh', 'auth', 'status'],
 *     ['gh', 'auth', 'refresh'],
 *   )
 *   // → false
 */
export function simpleCommandStartsWith(
  tokens: readonly string[],
  prefix: readonly string[],
): boolean {
  const { length: pl } = prefix
  if (tokens.length < pl) {
    return false
  }
  for (let i = 0; i < pl; i += 1) {
    if (tokens[i] !== prefix[i]) {
      return false
    }
  }
  return true
}
