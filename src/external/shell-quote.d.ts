/**
 * An operator token emitted by `parse` (`&&`, `||`, `;`, `|`, `(`, `)`, `<`,
 * `>`, etc.) or accepted by `quote`.
 */
export interface ShellOp {
  op: string
}

/**
 * A comment token (`# ...`) emitted by `parse` and accepted by `quote`.
 */
export interface ShellComment {
  comment: string
}

/**
 * A glob token (`*`, `?`, `[...]`) emitted by `parse` and accepted by `quote`.
 */
export interface ShellGlob {
  op: 'glob'
  pattern: string
}

/**
 * One entry of a parsed command line: a bare string token, an operator, a
 * comment, or a glob.
 */
export type ParseEntry = string | ShellOp | ShellComment | ShellGlob

/**
 * Escape an array of tokens into a single shell-safe command string (POSIX sh
 * semantics). Bare strings are quoted as needed; `ShellOp` / `ShellComment` /
 * `ShellGlob` objects are emitted as their operator / comment / pattern.
 */
export function quote(
  args: ReadonlyArray<string | ShellOp | ShellComment | ShellGlob>,
): string

/**
 * Tokenize a command line into `ParseEntry` items. `$VAR` references resolve
 * against `env` (a record or a lookup function); unresolved references collapse
 * to an empty string. Throws on unterminated quotes.
 */
export function parse(
  cmd: string,
  env?:
    | Record<string, string>
    | ((key: string) => string | undefined)
    | undefined,
  opts?: { escape?: string } | undefined,
): ParseEntry[]
