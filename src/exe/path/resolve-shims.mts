/**
 * @file Wrapper-script parsers: given a shim's source text, extract the
 *   relative path to the real script it executes.
 *   A binary like `npm` is rarely an executable. It is a generated wrapper —
 *   `npm.cmd` / `npm.ps1` / an extensionless shell script — whose format is
 *   fixed by the npm CLI build, by a manager's own installer, or by
 *   `cmd-shim`. Each parser here pattern-matches one of those formats and
 *   returns the captured relative path, or `''` when the source does not
 *   match. Dispatch is by `binShimFormat`, so a new manager is a table row
 *   rather than another branch here.
 *   Every function is pure over its source string: no filesystem, no platform
 *   check. That is what lets the Windows-only formats be unit-tested on any
 *   host, and it keeps the branchy regex work out of the resolver that owns
 *   the I/O.
 */

import { StringPrototypeStartsWith } from '../../primordials/string.mjs'
import { BIN_SHIM_FORMAT, binShimFormat } from './bin-kinds.mjs'

/**
 * One shim to parse: its basename, its lowered extension, and its source text.
 */
export type ShimSource = {
  basename: string
  extLowered: string
  source: string
}

/**
 * The generic `cmd-shim` formats, used for every package binary that does not
 * ship a bespoke wrapper.
 *
 * Verbatim shim bodies: docs/references/repo/cmd-shim-formats.md. The regexes
 * match that exact generated text, so an upstream wording change yields an
 * empty path rather than a loud failure.
 */
export function cmdShimRelPath(config: ShimSource): string {
  const { extLowered, source } = config
  if (extLowered === '.cmd') {
    // require-regex-comment: captures the script path from the cmd-shim `"%dp0%\<path>" %*` tail.
    return /(?<="%dp0%\\)[^"\r\n]+(?=" %\*\r?\n)/.exec(source)?.[0] || ''
  }
  if (extLowered === '') {
    // require-regex-comment: captures the script path from the cmd-shim `"$basedir/<path>" "$@"` tail.
    return /(?<="\$basedir\/)[^"\r\n]+(?=" "\$@"\r?\n)/.exec(source)?.[0] || ''
  }
  if (extLowered === '.ps1') {
    // require-regex-comment: captures the script path from the cmd-shim `"$basedir/<path>" $args` tail.
    return /(?<="\$basedir\/)[^"\r\n]+(?=" \$args\r?\n)/.exec(source)?.[0] || ''
  }
  return ''
}

/**
 * The installer-emitted Unix shell formats, tried in order: a standalone
 * installer's `.tools/...` layout, the generic cmd-shim body, then the bare
 * `exec node "$basedir/..."` spelling a setup action emits.
 *
 * The setup-pnpm action emits a target of `pnpm/bin/pnpm.cjs` where the real
 * layout is one directory up, so that one spelling is repaired here.
 */
export function installerPosixShimRelPath(config: ShimSource): string {
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
 * The installer-emitted `.cmd` formats, tried in order: a setup action's
 * `node "%~dp0\..."`, the bundled-node variant that spells `node.exe` first,
 * then the generic cmd-shim body.
 */
export function installerWindowsCmdRelPath(source: string): string {
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
    /(?<="%dp0%\\)[^"\r\n]+(?=" %\*\r?\n)/.exec(source)?.[0] ||
    ''
  )
}

/**
 * The extensionless installer-emitted shell formats, tried in order: a
 * standalone installer's `.tools/pnpm/<version>` layout under either
 * `"$basedir/node"` or a bare `exec node`, then the generic cmd-shim body.
 */
export function installerWindowsShellRelPath(source: string): string {
  return (
    // require-regex-comment: captures a `.tools/pnpm/<version>/...` path from `"$basedir/<path>" "$@"`.
    /(?<="\$basedir\/)\.tools\/pnpm\/[^"]+(?="\s+"\$@")/.exec(source)?.[0] ||
    // require-regex-comment: captures a `.tools/pnpm/<version>/...` path from `exec node "$basedir/<path>" "$@"`.
    /(?<=exec\s+node\s+"\$basedir\/)\.tools\/pnpm\/[^"]+(?="\s+"\$@")/.exec(
      source,
    )?.[0] ||
    // require-regex-comment: captures the script path from the cmd-shim `"$basedir/<path>" "$@"` tail.
    /(?<="\$basedir\/)[^"\r\n]+(?=" "\$@"\r?\n)/.exec(source)?.[0] ||
    ''
  )
}

/**
 * The installer-emitted wrapper formats, which vary by install method — a
 * setup action, a global install, and a standalone installer each generate a
 * different body.
 */
export function installerWindowsShimRelPath(config: ShimSource): string {
  const { extLowered, source } = config
  if (extLowered === '.cmd') {
    return installerWindowsCmdRelPath(source)
  }
  if (extLowered === '') {
    return installerWindowsShellRelPath(source)
  }
  if (extLowered === '.ps1') {
    // require-regex-comment: captures the script path from the PowerShell `"$basedir/<path>" $args` tail.
    return /(?<="\$basedir\/)[^"\r\n]+(?=" \$args\r?\n)/.exec(source)?.[0] || ''
  }
  return ''
}

/**
 * The npm CLI's Unix shell format, which assigns the target to `NPM_CLI_JS`.
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
 * The npm CLI's wrapper formats. Each variant assigns the target to a shell
 * variable, so the parse is a lookbehind on that assignment.
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
 * The Unix wrapper's relative target, dispatched by shim format. A `cmd-shim`
 * binary on Unix is already the real script, so it answers `''`.
 */
export function posixShimRelPath(config: ShimSource): string {
  const format = binShimFormat(config.basename)
  if (format === BIN_SHIM_FORMAT.installer) {
    return installerPosixShimRelPath(config)
  }
  if (format === BIN_SHIM_FORMAT.npmCli) {
    return npmPosixShimRelPath(config)
  }
  return ''
}

/**
 * The Windows wrapper's relative target, dispatched by shim format.
 */
export function windowsShimRelPath(config: ShimSource): string {
  const format = binShimFormat(config.basename)
  if (format === BIN_SHIM_FORMAT.npmCli) {
    return npmWindowsShimRelPath(config)
  }
  if (format === BIN_SHIM_FORMAT.installer) {
    return installerWindowsShimRelPath(config)
  }
  return cmdShimRelPath(config)
}
