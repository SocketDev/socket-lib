/**
 * @file Wrapper-script parsers: given a shim's source text, extract the
 *   relative path to the real script it executes.
 *   A binary like `npm` is rarely an executable. It is a generated wrapper —
 *   `npm.cmd` / `npm.ps1` / an extensionless shell script — whose format is
 *   fixed by either the npm CLI build or by `cmd-shim`. Each parser here
 *   pattern-matches one of those formats and returns the captured relative
 *   path, or `''` when the source does not match.
 *   Every function is pure over its source string: no filesystem, no platform
 *   check. That is what lets the Windows-only formats be unit-tested on any
 *   host, and it keeps the branchy regex work out of the resolver that owns
 *   the I/O.
 */

import { StringPrototypeStartsWith } from '../../primordials/string.mjs'
import { isNpmOrNpxBin, isPnpmOrYarnBin } from './bin-kinds.mjs'

/**
 * One shim to parse: its basename, its lowered extension, and its source text.
 */
export type ShimSource = {
  basename: string
  extLowered: string
  source: string
}

/**
 * The generic `cmd-shim` formats used for every package binary that is not
 * npm, npx, pnpm or yarn.
 *
 * Verbatim shim bodies: docs/references/repo/cmd-shim-formats.md. The regexes
 * match that exact generated text, so an upstream wording change yields an
 * empty path rather than a loud failure.
 */
export function cmdShimRelPath(config: ShimSource): string {
  const { extLowered, source } = config
  if (extLowered === '.cmd') {
    // require-regex-comment: captures the script path from the cmd-shim `"%dp0%\<path>" %*` tail.
    return /(?<="%dp0%\\).*(?=" %\*\r\n)/.exec(source)?.[0] || ''
  }
  if (extLowered === '') {
    // require-regex-comment: captures the script path from the cmd-shim `"$basedir/<path>" "$@"` tail.
    return /(?<="$basedir\/).*(?=" "\$@"\n)/.exec(source)?.[0] || ''
  }
  if (extLowered === '.ps1') {
    // require-regex-comment: captures the script path from the cmd-shim `"$basedir/<path>" $args` tail.
    return /(?<="\$basedir\/).*(?=" $args\n)/.exec(source)?.[0] || ''
  }
  return ''
}

/**
 * The npm/npx Unix shell format, which assigns the CLI path to `NPM_CLI_JS`.
 */
export function npmPosixShimRelPath(config: ShimSource): string {
  const { basename, source } = config
  // require-regex-comment: captures the CLI path from `NPM_CLI_JS="$CLI_BASEDIR/<path>"`.
  const re =
    basename === 'npm'
      ? /(?<=NPM_CLI_JS="\$CLI_BASEDIR\/).*(?=")/
      : /(?<=NPX_CLI_JS="\$CLI_BASEDIR\/).*(?=")/
  return re.exec(source)?.[0] || ''
}

/**
 * The npm/npx wrapper formats, defined by the npm CLI build. Each variant
 * assigns the CLI path to a shell variable, so the parse is a lookbehind on
 * that assignment.
 *
 * Sources: npm/cli v11.4.2 `bin/npm{,.cmd,.ps1}` and `bin/npx{,.cmd,.ps1}`.
 */
export function npmWindowsShimRelPath(config: ShimSource): string {
  const { basename, extLowered, source } = config
  const isNpm = basename === 'npm'
  if (extLowered === '.cmd') {
    // require-regex-comment: captures the CLI path from `"NPM_CLI_JS=%~dp0\<path>"`.
    const re = isNpm
      ? /(?<="NPM_CLI_JS=%~dp0\\).*(?=")/
      : /(?<="NPX_CLI_JS=%~dp0\\).*(?=")/
    return re.exec(source)?.[0] || ''
  }
  if (extLowered === '') {
    // require-regex-comment: captures the CLI path from `NPM_CLI_JS="$CLI_BASEDIR/<path>"`.
    const re = isNpm
      ? /(?<=NPM_CLI_JS="\$CLI_BASEDIR\/).*(?=")/
      : /(?<=NPX_CLI_JS="\$CLI_BASEDIR\/).*(?=")/
    return re.exec(source)?.[0] || ''
  }
  if (extLowered === '.ps1') {
    // require-regex-comment: captures the CLI path from `$NPM_CLI_JS="$PSScriptRoot/<path>"`.
    const re = isNpm
      ? /(?<=\$NPM_CLI_JS="\$PSScriptRoot\/).*(?=")/
      : /(?<=\$NPX_CLI_JS="\$PSScriptRoot\/).*(?=")/
    return re.exec(source)?.[0] || ''
  }
  return ''
}

/**
 * The pnpm/yarn Unix shell formats, tried in order: the standalone installer's
 * `.tools/...` layout, the generic cmd-shim body, then the setup-pnpm action's
 * `exec node "$basedir/..."` spelling.
 *
 * The setup-pnpm action emits a target of `pnpm/bin/pnpm.cjs` where the real
 * layout is one directory up, so that one spelling is repaired here.
 */
export function pnpmPosixShimRelPath(config: ShimSource): string {
  const { basename, source } = config
  const relPath =
    // require-regex-comment: captures a `.tools/...` path from `"$basedir/<path>" "$@"`.
    /(?<="\$basedir\/)\.tools\/[^"]+(?="\s+"\$@")/.exec(source)?.[0] ||
    // require-regex-comment: captures any script path from `"$basedir/<path>" "$@"`.
    /(?<="\$basedir\/)[^"]+(?="\s+"\$@")/.exec(source)?.[0] ||
    // require-regex-comment: captures the script path from `exec node "$basedir/<path>" "$@"`.
    /exec\s+node\s+"?\$basedir\/(?<relPath>[^"]+)"?\s+"\$@"/.exec(source)
      ?.groups?.['relPath'] ||
    ''
  if (
    relPath &&
    basename === 'pnpm' &&
    StringPrototypeStartsWith(relPath, 'pnpm/')
  ) {
    return `../${relPath}`
  }
  return relPath
}

/**
 * The pnpm/yarn `.cmd` formats, tried in order: the setup-pnpm action's
 * `node "%~dp0\..."`, the bundled-node variant that spells `node.exe` first,
 * then the generic cmd-shim body.
 */
export function pnpmWindowsCmdRelPath(source: string): string {
  return (
    // require-regex-comment: captures the script path from `node "%~dp0\<path>" %*`.
    /(?<=node\s+")%~dp0\\(?<relPath>[^"]+)(?="\s+%\*)/.exec(source)?.groups?.[
      'relPath'
    ] ||
    // require-regex-comment: captures the script path from `"%~dp0\node.exe" "%~dp0\<path>" %*`.
    /(?<="%~dp0\\[^"]*node[^"]*"\s+")%~dp0\\(?<relPath>[^"]+)(?="\s+%\*)/.exec(
      source,
    )?.groups?.['relPath'] ||
    // require-regex-comment: captures the script path from the cmd-shim `"%dp0%\<path>" %*` tail.
    /(?<="%dp0%\\).*(?=" %\*\r\n)/.exec(source)?.[0] ||
    ''
  )
}

/**
 * The extensionless pnpm/yarn shell formats, tried in order: the standalone
 * installer's `.tools/pnpm/<version>` layout under either `"$basedir/node"` or
 * a bare `exec node`, then the generic cmd-shim body.
 */
export function pnpmWindowsShellRelPath(source: string): string {
  return (
    // require-regex-comment: captures a `.tools/pnpm/<version>/...` path from `"$basedir/<path>" "$@"`.
    /(?<="\$basedir\/)\.tools\/pnpm\/[^"]+(?="\s+"\$@")/.exec(source)?.[0] ||
    // require-regex-comment: captures a `.tools/pnpm/<version>/...` path from `exec node "$basedir/<path>" "$@"`.
    /(?<=exec\s+node\s+"\$basedir\/)\.tools\/pnpm\/[^"]+(?="\s+"\$@")/.exec(
      source,
    )?.[0] ||
    // require-regex-comment: captures the script path from the cmd-shim `"$basedir/<path>" "$@"` tail.
    /(?<="\$basedir\/).*(?=" "\$@"\n)/.exec(source)?.[0] ||
    ''
  )
}

/**
 * The pnpm/yarn wrapper formats, which vary by installation method — the
 * setup-pnpm action, a global `npm install`, and the standalone installer all
 * generate different bodies.
 */
export function pnpmWindowsShimRelPath(config: ShimSource): string {
  const { extLowered, source } = config
  if (extLowered === '.cmd') {
    return pnpmWindowsCmdRelPath(source)
  }
  if (extLowered === '') {
    return pnpmWindowsShellRelPath(source)
  }
  if (extLowered === '.ps1') {
    // require-regex-comment: captures the script path from the PowerShell `"$basedir/<path>" $args` tail.
    return /(?<="\$basedir\/).*(?=" $args\n)/.exec(source)?.[0] || ''
  }
  return ''
}

/**
 * The Unix wrapper's relative target, dispatched by binary family. Only the
 * npm and pnpm families ship a parseable shell wrapper; anything else is
 * already the real script.
 */
export function posixShimRelPath(config: ShimSource): string {
  const { basename } = config
  if (isPnpmOrYarnBin(basename)) {
    return pnpmPosixShimRelPath(config)
  }
  if (isNpmOrNpxBin(basename)) {
    return npmPosixShimRelPath(config)
  }
  return ''
}

/**
 * The Windows wrapper's relative target, dispatched by binary family.
 */
export function windowsShimRelPath(config: ShimSource): string {
  const { basename } = config
  if (isNpmOrNpxBin(basename)) {
    return npmWindowsShimRelPath(config)
  }
  if (isPnpmOrYarnBin(basename)) {
    return pnpmWindowsShimRelPath(config)
  }
  return cmdShimRelPath(config)
}
