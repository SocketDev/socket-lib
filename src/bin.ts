/**
 * @fileoverview Binary path resolution and execution utilities for package managers.
 * Provides cross-platform bin path lookup, command execution, and path normalization.
 */

import process from 'node:process'

import { WIN32 } from './constants/platform'
import { getHome } from './env/home'
import { getAppdata, getLocalappdata } from './env/windows'
import { getXdgDataHome } from './env/xdg'
import whichModule from './external/which'
import { readJsonSync } from './fs'
import { isPath, normalizePath } from './paths/normalize'
import { spawn } from './spawn'

// Cache for binary path resolutions to avoid repeated PATH searches.
// Cache is validated with existsSync() which is much cheaper than PATH search.
const binPathCache = new Map<string, string>()
// Separate cache for 'all: true' results (array of paths).
const binPathAllCache = new Map<string, string[]>()
// Cache for Volta binary path resolutions (keyed by volta path + binary name).
const voltaBinCache = new Map<string, string>()

let _fs: typeof import('node:fs') | undefined
/**
 * Lazily load the fs module to avoid Webpack errors.
 * Uses non-'node:' prefixed require to prevent Webpack bundling issues.
 *
 * @private
 */
/*@__NO_SIDE_EFFECTS__*/
function getFs() {
  if (_fs === undefined) {
    // Use non-'node:' prefixed require to avoid Webpack errors.

    _fs = /*@__PURE__*/ require('node:fs')
  }
  return _fs as typeof import('node:fs')
}

let _path: typeof import('node:path') | undefined
/**
 * Lazily load the path module to avoid Webpack errors.
 * Uses non-'node:' prefixed require to prevent Webpack bundling issues.
 *
 * @returns The Node.js path module
 * @private
 */
/*@__NO_SIDE_EFFECTS__*/
function getPath() {
  if (_path === undefined) {
    // Use non-'node:' prefixed require to avoid Webpack errors.

    _path = /*@__PURE__*/ require('node:path')
  }
  return _path as typeof import('node:path')
}

/**
 * Options for the which function.
 */
export interface WhichOptions {
  /** If true, return all matches instead of just the first one. */
  all?: boolean | undefined
  /** If true, return null instead of throwing when no match is found. */
  nothrow?: boolean | undefined
  /** Path to search in. */
  path?: string | undefined
  /** Path separator character. */
  pathExt?: string | undefined
  /** Environment variables to use. */
  env?: Record<string, string | undefined> | undefined
  /** Current working directory for resolving relative paths. */
  cwd?: string | undefined
}

/**
 * Execute a binary with the given arguments.
 *
 * @example
 * ```typescript
 * await execBin('pnpm', ['install'])
 * await execBin('/usr/local/bin/node', ['script.js'], { cwd: '/tmp' })
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export async function execBin(
  binPath: string,
  args?: string[],
  options?: import('./spawn').SpawnOptions,
) {
  // Resolve the binary path, using cache for binary names (not paths).
  let resolvedPath: string | string[] | undefined
  if (isPath(binPath)) {
    resolvedPath = resolveRealBinSync(binPath)
  } else {
    // Check cache first for binary names.
    // Validate with existsSync() - cheaper than full PATH search.
    const cached = binPathCache.get(binPath)
    if (cached) {
      if (getFs().existsSync(cached)) {
        resolvedPath = cached
      } else {
        // Cached path no longer exists, remove stale entry.
        binPathCache.delete(binPath)
      }
    }
    if (!resolvedPath) {
      resolvedPath = await whichReal(binPath)
      // Cache the result if found.
      if (typeof resolvedPath === 'string') {
        binPathCache.set(binPath, resolvedPath)
      }
    }
  }

  if (!resolvedPath) {
    const error = new Error(
      `Binary not found: ${binPath}\n` +
        'Possible causes:\n' +
        `  - Binary "${binPath}" is not installed or not in PATH\n` +
        '  - Binary name is incorrect or misspelled\n' +
        '  - Installation directory is not in system PATH\n' +
        'To resolve:\n' +
        `  1. Verify "${binPath}" is installed: which ${binPath} (Unix) or where ${binPath} (Windows)\n` +
        `  2. Install the binary if missing, ex: npm install -g ${binPath}\n` +
        '  3. Check PATH environment variable includes the binary location',
    ) as Error & {
      code: string
    }
    error.code = 'ENOENT'
    throw error
  }

  // Execute the binary directly.
  const binCommand = Array.isArray(resolvedPath)
    ? resolvedPath[0]!
    : resolvedPath
  // On Windows, binaries are often .cmd files that require shell to execute.
  return await spawn(binCommand, args ?? [], {
    shell: WIN32,
    ...options,
  })
}

/**
 * Find the real executable for a binary, bypassing shadow bins.
 *
 * @example
 * ```typescript
 * const npmPath = findRealBin('npm', ['/usr/local/bin/npm'])
 * const gitPath = findRealBin('git')
 * ```
 */
export function findRealBin(
  binName: string,
  commonPaths: string[] = [],
): string | undefined {
  const fs = getFs()
  const path = getPath()

  // Try common locations first.
  for (const binPath of commonPaths) {
    if (fs.existsSync(binPath)) {
      return binPath
    }
  }

  // Fall back to whichModule.sync if no direct path found.
  // Use all: true to get all paths in a single call (avoids double PATH search on Windows).
  /* c8 ignore next - External which call */
  const allPaths = whichModule.sync(binName, { all: true, nothrow: true }) || []
  // Ensure allPaths is an array.
  const pathsArray = Array.isArray(allPaths)
    ? allPaths
    : typeof allPaths === 'string'
      ? [allPaths]
      : []

  if (pathsArray.length === 0) {
    return undefined
  }

  // First, try to find a non-shadow bin path.
  for (const binPath of pathsArray) {
    const binDir = path.dirname(binPath)
    if (!isShadowBinPath(binDir)) {
      return binPath
    }
  }

  // If all paths are shadow bins, return the first one.
  return pathsArray[0]
}

/**
 * Find the real npm executable, bypassing any aliases and shadow bins.
 *
 * @example
 * ```typescript
 * const npmPath = findRealNpm()
 * // e.g. '/usr/local/bin/npm'
 * ```
 */
export function findRealNpm(): string {
  const fs = getFs()
  const path = getPath()

  // Try to find npm alongside the node executable. On Windows this is
  // npm.cmd; on POSIX it's the bare npm shim.
  const nodeDir = path.dirname(process.execPath)
  const nodeDirCandidates = WIN32
    ? [path.join(nodeDir, 'npm.cmd'), path.join(nodeDir, 'npm')]
    : [path.join(nodeDir, 'npm')]
  for (const candidate of nodeDirCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  // Try common npm locations per platform.
  const appdata = getAppdata()
  const commonPaths = WIN32
    ? [
        appdata ? path.join(appdata, 'npm', 'npm.cmd') : '',
        appdata ? path.join(appdata, 'npm', 'npm') : '',
        'C:\\Program Files\\nodejs\\npm.cmd',
        'C:\\Program Files\\nodejs\\npm',
      ].filter(Boolean)
    : ['/usr/local/bin/npm', '/usr/bin/npm']
  const result = findRealBin('npm', commonPaths)

  // If we found a valid path, return it.
  if (result && fs.existsSync(result)) {
    return result
  }

  // As a last resort, try to use whichRealSync to find npm.
  // This handles cases where npm is installed in non-standard locations.
  const npmPath = whichRealSync('npm', { nothrow: true })
  if (npmPath && typeof npmPath === 'string' && fs.existsSync(npmPath)) {
    return npmPath
  }

  // Return the basic 'npm' and let the system resolve it.
  return 'npm'
}

/**
 * Find the real pnpm executable, bypassing any aliases and shadow bins.
 *
 * @example
 * ```typescript
 * const pnpmPath = findRealPnpm()
 * // e.g. '/usr/local/bin/pnpm'
 * ```
 */
export function findRealPnpm(): string {
  const path = getPath()
  const home = getHome()
  const appdata = getAppdata()
  const localappdata = getLocalappdata()
  const xdgDataHome = getXdgDataHome()

  // Try common pnpm locations. Guard each env-derived path with its
  // existence — getHome()/getAppdata()/etc. can all return undefined.
  const commonPaths = WIN32
    ? [
        appdata ? path.join(appdata, 'npm', 'pnpm.cmd') : '',
        appdata ? path.join(appdata, 'npm', 'pnpm') : '',
        localappdata ? path.join(localappdata, 'pnpm', 'pnpm.cmd') : '',
        localappdata ? path.join(localappdata, 'pnpm', 'pnpm') : '',
        'C:\\Program Files\\nodejs\\pnpm.cmd',
        'C:\\Program Files\\nodejs\\pnpm',
      ].filter(Boolean)
    : [
        '/usr/local/bin/pnpm',
        '/usr/bin/pnpm',
        xdgDataHome
          ? path.join(xdgDataHome, 'pnpm/pnpm')
          : home
            ? path.join(home, '.local/share/pnpm/pnpm')
            : '',
        home ? path.join(home, '.pnpm/pnpm') : '',
      ].filter(Boolean)

  return findRealBin('pnpm', commonPaths) ?? ''
}

/**
 * Find the real yarn executable, bypassing any aliases and shadow bins.
 *
 * @example
 * ```typescript
 * const yarnPath = findRealYarn()
 * // e.g. '/usr/local/bin/yarn'
 * ```
 */
export function findRealYarn(): string {
  const path = getPath()
  const home = getHome()
  const appdata = getAppdata()

  // Try common yarn locations per platform. Guard env-derived paths with
  // existence checks — getHome()/getAppdata() can return undefined.
  const commonPaths = WIN32
    ? [
        appdata ? path.join(appdata, 'npm', 'yarn.cmd') : '',
        appdata ? path.join(appdata, 'npm', 'yarn') : '',
        home ? path.join(home, '.yarn/bin/yarn.cmd') : '',
        home ? path.join(home, '.yarn/bin/yarn') : '',
        'C:\\Program Files\\nodejs\\yarn.cmd',
        'C:\\Program Files\\nodejs\\yarn',
      ].filter(Boolean)
    : [
        '/usr/local/bin/yarn',
        '/usr/bin/yarn',
        home ? path.join(home, '.yarn/bin/yarn') : '',
        home
          ? path.join(home, '.config/yarn/global/node_modules/.bin/yarn')
          : '',
      ].filter(Boolean)

  return findRealBin('yarn', commonPaths) ?? ''
}

/**
 * Check if a directory path contains any shadow bin patterns.
 *
 * @example
 * ```typescript
 * isShadowBinPath('/tmp/project/node_modules/.bin')  // true
 * isShadowBinPath('/usr/local/bin')                   // false
 * ```
 */
export function isShadowBinPath(dirPath: string | undefined): boolean {
  if (!dirPath) {
    return false
  }
  // Check for node_modules/.bin pattern (Unix and Windows)
  const normalized = dirPath.replace(/\\/g, '/')
  return normalized.includes('node_modules/.bin')
}

/*@__NO_SIDE_EFFECTS__*/
/**
 * Resolve a binary path to the real underlying script file.
 * Handles Windows .cmd wrappers and Unix shell scripts, resolving them to the actual .js files they execute.
 *
 * @example
 * ```typescript
 * const realPath = resolveRealBinSync('/usr/local/bin/npm')
 * // e.g. '/usr/local/lib/node_modules/npm/bin/npm-cli.js'
 * ```
 */
export function resolveRealBinSync(binPath: string): string {
  const fs = getFs()
  const path = getPath()

  // If it's not an absolute path, try to find it in PATH first
  if (!path.isAbsolute(binPath)) {
    try {
      const resolved = whichRealSync(binPath)
      if (resolved) {
        binPath = resolved as string
      }
    } catch {}
  }

  // Normalize the path once for consistent pattern matching.
  binPath = normalizePath(binPath)

  // Handle empty string that normalized to '.' (current directory)
  if (binPath === '.') {
    return binPath
  }

  const ext = path.extname(binPath)
  const extLowered = ext.toLowerCase()
  const basename = path.basename(binPath, ext)
  const voltaIndex =
    basename === 'node' ? -1 : (/(?<=\/)\.volta\//i.exec(binPath)?.index ?? -1)
  if (voltaIndex !== -1) {
    const voltaPath = binPath.slice(0, voltaIndex)
    // Check Volta cache first - keyed by volta path + binary name.
    const voltaCacheKey = `${voltaPath}:${basename}`
    const cachedVolta = voltaBinCache.get(voltaCacheKey)
    if (cachedVolta) {
      if (fs.existsSync(cachedVolta)) {
        return cachedVolta
      }
      // Cached Volta path no longer exists, remove stale entry.
      voltaBinCache.delete(voltaCacheKey)
    }

    const voltaToolsPath = path.join(voltaPath, 'tools')
    const voltaImagePath = path.join(voltaToolsPath, 'image')
    const voltaUserPath = path.join(voltaToolsPath, 'user')
    const voltaPlatform = readJsonSync(
      path.join(voltaUserPath, 'platform.json'),
      { throws: false },
    ) as any
    const voltaNodeVersion = voltaPlatform?.node?.runtime
    const voltaNpmVersion = voltaPlatform?.node?.npm
    let voltaBinPath = ''
    if (basename === 'npm' || basename === 'npx') {
      if (voltaNpmVersion) {
        const relCliPath = `bin/${basename}-cli.js`
        voltaBinPath = path.join(
          voltaImagePath,
          `npm/${voltaNpmVersion}/${relCliPath}`,
        )
        if (voltaNodeVersion && !fs.existsSync(voltaBinPath)) {
          voltaBinPath = path.join(
            voltaImagePath,
            `node/${voltaNodeVersion}/lib/node_modules/npm/${relCliPath}`,
          )
          if (!fs.existsSync(voltaBinPath)) {
            voltaBinPath = ''
          }
        }
      }
    } else {
      const voltaUserBinPath = path.join(voltaUserPath, 'bin')
      const binInfo = readJsonSync(
        path.join(voltaUserBinPath, `${basename}.json`),
        { throws: false },
      ) as any
      const binPackage = binInfo?.package
      if (binPackage) {
        voltaBinPath = path.join(
          voltaImagePath,
          `packages/${binPackage}/bin/${basename}`,
        )
        if (!fs.existsSync(voltaBinPath)) {
          voltaBinPath = `${voltaBinPath}.cmd`
          if (!fs.existsSync(voltaBinPath)) {
            voltaBinPath = ''
          }
        }
      }
    }
    if (voltaBinPath) {
      let resolvedVoltaPath = voltaBinPath
      try {
        resolvedVoltaPath = normalizePath(fs.realpathSync.native(voltaBinPath))
      } catch {}
      // Cache the resolved Volta path.
      voltaBinCache.set(voltaCacheKey, resolvedVoltaPath)
      return resolvedVoltaPath
    }
  }
  if (WIN32) {
    const hasKnownExt =
      extLowered === '' ||
      extLowered === '.cmd' ||
      extLowered === '.exe' ||
      extLowered === '.ps1'
    const isNpmOrNpx = basename === 'npm' || basename === 'npx'
    const isPnpmOrYarn = basename === 'pnpm' || basename === 'yarn'
    if (hasKnownExt && isNpmOrNpx) {
      // The quick route assumes a bin path like: C:\Program Files\nodejs\npm.cmd
      const quickPath = path.join(
        path.dirname(binPath),
        `node_modules/npm/bin/${basename}-cli.js`,
      )
      if (fs.existsSync(quickPath)) {
        try {
          return fs.realpathSync.native(quickPath)
        } catch {}
        return quickPath
      }
    }
    let relPath = ''
    if (
      hasKnownExt &&
      // Only parse shell scripts and batch files, not actual executables.
      // .exe files are already executables and don't need path resolution from wrapper scripts.
      extLowered !== '.exe' &&
      // Check if file exists before attempting to read it to avoid ENOENT errors.
      fs.existsSync(binPath)
    ) {
      const source = fs.readFileSync(binPath, 'utf8')
      if (isNpmOrNpx) {
        if (extLowered === '.cmd') {
          // "npm.cmd" and "npx.cmd" defined by
          // https://github.com/npm/cli/blob/v11.4.2/bin/npm.cmd
          // https://github.com/npm/cli/blob/v11.4.2/bin/npx.cmd
          relPath =
            basename === 'npm'
              ? /(?<="NPM_CLI_JS=%~dp0\\).*(?=")/.exec(source)?.[0] || ''
              : /(?<="NPX_CLI_JS=%~dp0\\).*(?=")/.exec(source)?.[0] || ''
        } else if (extLowered === '') {
          // Extensionless "npm" and "npx" defined by
          // https://github.com/npm/cli/blob/v11.4.2/bin/npm
          // https://github.com/npm/cli/blob/v11.4.2/bin/npx
          relPath =
            basename === 'npm'
              ? /(?<=NPM_CLI_JS="\$CLI_BASEDIR\/).*(?=")/.exec(source)?.[0] ||
                ''
              : /(?<=NPX_CLI_JS="\$CLI_BASEDIR\/).*(?=")/.exec(source)?.[0] ||
                ''
        } else if (extLowered === '.ps1') {
          // "npm.ps1" and "npx.ps1" defined by
          // https://github.com/npm/cli/blob/v11.4.2/bin/npm.ps1
          // https://github.com/npm/cli/blob/v11.4.2/bin/npx.ps1
          relPath =
            basename === 'npm'
              ? /(?<=\$NPM_CLI_JS="\$PSScriptRoot\/).*(?=")/.exec(
                  source,
                )?.[0] || ''
              : /(?<=\$NPX_CLI_JS="\$PSScriptRoot\/).*(?=")/.exec(
                  source,
                )?.[0] || ''
        }
      } else if (isPnpmOrYarn) {
        if (extLowered === '.cmd') {
          // pnpm.cmd and yarn.cmd can have different formats depending on installation method
          // Common formats include:
          // 1. Setup-pnpm action format: node "%~dp0\..\pnpm\bin\pnpm.cjs" %*
          // 2. npm install -g pnpm format: similar to cmd-shim
          // 3. Standalone installer format: various patterns

          // Try setup-pnpm/setup-yarn action format first
          relPath =
            /(?<=node\s+")%~dp0\\([^"]+)(?="\s+%\*)/.exec(source)?.[1] || ''

          // Try alternative format: "%~dp0\node.exe" "%~dp0\..\package\bin\binary.js" %*
          if (!relPath) {
            relPath =
              /(?<="%~dp0\\[^"]*node[^"]*"\s+")%~dp0\\([^"]+)(?="\s+%\*)/.exec(
                source,
              )?.[1] || ''
          }

          // Try cmd-shim format as fallback
          if (!relPath) {
            relPath = /(?<="%dp0%\\).*(?=" %\*\r\n)/.exec(source)?.[0] || ''
          }
        } else if (extLowered === '') {
          // Extensionless pnpm/yarn - try common shebang formats
          // Handle pnpm installed via standalone installer or global install
          // Format: exec "$basedir/node"  "$basedir/.tools/pnpm/VERSION/..." "$@"
          // Note: may have multiple spaces between arguments
          relPath =
            /(?<="\$basedir\/)\.tools\/pnpm\/[^"]+(?="\s+"\$@")/.exec(
              source,
            )?.[0] || ''
          if (!relPath) {
            // Also try: exec node  "$basedir/.tools/pnpm/VERSION/..." "$@"
            relPath =
              /(?<=exec\s+node\s+"\$basedir\/)\.tools\/pnpm\/[^"]+(?="\s+"\$@")/.exec(
                source,
              )?.[0] || ''
          }
          if (!relPath) {
            // Try standard cmd-shim format: exec node "$basedir/../package/bin/binary.js" "$@"
            relPath = /(?<="\$basedir\/).*(?=" "\$@"\n)/.exec(source)?.[0] || ''
          }
        } else if (extLowered === '.ps1') {
          // PowerShell format
          relPath = /(?<="\$basedir\/).*(?=" $args\n)/.exec(source)?.[0] || ''
        }
      } else if (extLowered === '.cmd') {
        // "bin.CMD" generated by
        // https://github.com/npm/cmd-shim/blob/v7.0.0/lib/index.js#L98:
        //
        // @ECHO off
        // GOTO start
        // :find_dp0
        // SET dp0=%~dp0
        // EXIT /b
        // :start
        // SETLOCAL
        // CALL :find_dp0
        //
        // IF EXIST "%dp0%\node.exe" (
        //   SET "_prog=%dp0%\node.exe"
        // ) ELSE (
        //   SET "_prog=node"
        //   SET PATHEXT=%PATHEXT:;.JS;=;%
        // )
        //
        // endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\..\<PACKAGE_NAME>\path\to\bin.js" %*
        relPath = /(?<="%dp0%\\).*(?=" %\*\r\n)/.exec(source)?.[0] || ''
      } else if (extLowered === '') {
        // Extensionless "bin" generated by
        // https://github.com/npm/cmd-shim/blob/v7.0.0/lib/index.js#L138:
        //
        // #!/bin/sh
        // basedir=$(dirname "$(echo "$0" | sed -e 's,\\,/,g')")
        //
        // case `uname` in
        //     *CYGWIN*|*MINGW*|*MSYS*)
        //         if command -v cygpath > /dev/null 2>&1; then
        //             basedir=`cygpath -w "$basedir"`
        //         fi
        //     ;;
        // esac
        //
        // if [ -x "$basedir/node" ]; then
        //   exec "$basedir/node"  "$basedir/../<PACKAGE_NAME>/path/to/bin.js" "$@"
        // else
        //   exec node  "$basedir/../<PACKAGE_NAME>/path/to/bin.js" "$@"
        // fi
        relPath = /(?<="$basedir\/).*(?=" "\$@"\n)/.exec(source)?.[0] || ''
      } else if (extLowered === '.ps1') {
        // "bin.PS1" generated by
        // https://github.com/npm/cmd-shim/blob/v7.0.0/lib/index.js#L192:
        //
        // #!/usr/bin/env pwsh
        // $basedir=Split-Path $MyInvocation.MyCommand.Definition -Parent
        //
        // $exe=""
        // if ($PSVersionTable.PSVersion -lt "6.0" -or $IsWindows) {
        //   # Fix case when both the Windows and Linux builds of Node
        //   # are installed in the same directory
        //   $exe=".exe"
        // }
        // $ret=0
        // if (Test-Path "$basedir/node$exe") {
        //   # Support pipeline input
        //   if ($MyInvocation.ExpectingInput) {
        //     $input | & "$basedir/node$exe"  "$basedir/../<PACKAGE_NAME>/path/to/bin.js" $args
        //   } else {
        //     & "$basedir/node$exe"  "$basedir/../<PACKAGE_NAME>/path/to/bin.js" $args
        //   }
        //   $ret=$LASTEXITCODE
        // } else {
        //   # Support pipeline input
        //   if ($MyInvocation.ExpectingInput) {
        //     $input | & "node$exe"  "$basedir/../<PACKAGE_NAME>/path/to/bin.js" $args
        //   } else {
        //     & "node$exe"  "$basedir/../<PACKAGE_NAME>/path/to/bin.js" $args
        //   }
        //   $ret=$LASTEXITCODE
        // }
        // exit $ret
        relPath = /(?<="\$basedir\/).*(?=" $args\n)/.exec(source)?.[0] || ''
      }
      if (relPath) {
        binPath = normalizePath(path.resolve(path.dirname(binPath), relPath))
      }
    }
  } else {
    // Handle Unix shell scripts (non-Windows platforms)
    let hasNoExt = extLowered === ''
    const isPnpmOrYarn = basename === 'pnpm' || basename === 'yarn'
    const isNpmOrNpx = basename === 'npm' || basename === 'npx'

    // Handle special case where pnpm path in CI has extra segments.
    // In setup-pnpm GitHub Action, the path might be malformed like:
    // /home/user/setup-pnpm/node_modules/.bin/pnpm/bin/pnpm.cjs
    // This happens when the shell script contains a relative path that
    // when resolved, creates an invalid nested structure.
    if (isPnpmOrYarn && binPath.includes('/.bin/pnpm/bin/')) {
      // Extract the correct pnpm bin path.
      const binIndex = binPath.indexOf('/.bin/pnpm')
      if (binIndex !== -1) {
        // Get the base path up to /.bin/pnpm.
        const baseBinPath = binPath.slice(0, binIndex + '/.bin/pnpm'.length)
        // Check if the original shell script exists.
        try {
          const stats = fs.statSync(baseBinPath)
          // Only use this path if it's a file (the shell script).
          if (stats.isFile()) {
            binPath = normalizePath(baseBinPath)
            // Recompute hasNoExt since we changed the path.
            hasNoExt = !path.extname(binPath)
          }
        } catch {
          // If stat fails, continue with the original path.
        }
      }
    }

    if (
      hasNoExt &&
      (isPnpmOrYarn || isNpmOrNpx) &&
      // For extensionless files (Unix shell scripts), verify existence before reading.
      // This prevents ENOENT errors when the bin path doesn't exist.
      fs.existsSync(binPath)
    ) {
      const source = fs.readFileSync(binPath, 'utf8')
      let relPath = ''

      if (isPnpmOrYarn) {
        // Handle pnpm/yarn Unix shell scripts.
        // Format: exec "$basedir/node" "$basedir/.tools/pnpm/VERSION/..." "$@"
        // or: exec node "$basedir/.tools/pnpm/VERSION/..." "$@"
        relPath =
          /(?<="\$basedir\/)\.tools\/[^"]+(?="\s+"\$@")/.exec(source)?.[0] || ''
        if (!relPath) {
          // Try standard cmd-shim format: exec node "$basedir/../package/bin/binary.js" "$@"
          // Example: exec node  "$basedir/../pnpm/bin/pnpm.cjs" "$@"
          //                              ^^^^^^^^^^^^^^^^^^^^^ captures this part
          // This regex needs to be more careful to not match "$@" at the end.
          relPath =
            /(?<="\$basedir\/)[^"]+(?="\s+"\$@")/.exec(source)?.[0] || ''
        }
        // Special case for setup-pnpm GitHub Action which may use a different format.
        // The setup-pnpm action creates a shell script that references ../pnpm/bin/pnpm.cjs
        if (!relPath) {
          // Try to match: exec node  "$basedir/../pnpm/bin/pnpm.cjs" "$@"
          const match = /exec\s+node\s+"?\$basedir\/([^"]+)"?\s+"\$@"/.exec(
            source,
          )
          if (match) {
            relPath = match[1] || ''
          }
        }
        // Check if the extracted path looks wrong (e.g., pnpm/bin/pnpm.cjs without ../).
        // This happens with setup-pnpm action when it creates a malformed shell script.
        if (relPath && basename === 'pnpm' && relPath.startsWith('pnpm/')) {
          // The path should be ../pnpm/... not pnpm/...
          // Prepend ../ to fix the relative path.
          relPath = `../${relPath}`
        }
      } else if (isNpmOrNpx) {
        // Handle npm/npx Unix shell scripts
        relPath =
          basename === 'npm'
            ? /(?<=NPM_CLI_JS="\$CLI_BASEDIR\/).*(?=")/.exec(source)?.[0] || ''
            : /(?<=NPX_CLI_JS="\$CLI_BASEDIR\/).*(?=")/.exec(source)?.[0] || ''
      }

      if (relPath) {
        // Resolve the relative path to handle .. segments properly.
        binPath = normalizePath(path.resolve(path.dirname(binPath), relPath))
      }
    }
  }
  try {
    const realPath = fs.realpathSync.native(binPath)
    return normalizePath(realPath)
  } catch {}
  // Return normalized path even if realpath fails.
  return normalizePath(binPath)
}

/**
 * Find an executable in the system PATH asynchronously.
 *
 * This function resolves binary names to their full paths by searching the system PATH.
 * It should only be used for binary names (not paths). If the input is already a path
 * (absolute or relative), it will be returned as-is without PATH resolution.
 *
 * Binary name vs. path detection:
 * - Binary names: 'npm', 'git', 'node' - will be resolved via PATH
 * - Absolute paths: '/usr/bin/node', 'C:\\Program Files\\nodejs\\node.exe' - returned as-is
 * - Relative paths: './node', '../bin/npm' - returned as-is
 *
 * @param {string} binName - The binary name to resolve (e.g., 'npm', 'git')
 * @param {WhichOptions | undefined} options - Options for resolution
 * @returns {Promise<string | string[] | null>} Promise resolving to the full path, the original path, or null if not found
 *
 * @example
 * ```typescript
 * // Resolve binary names
 * await which('node')              // '/usr/local/bin/node'
 * await which('npm')               // '/usr/local/bin/npm'
 * await which('nonexistent')       // null
 *
 * // Paths are returned as-is
 * await which('/usr/bin/node')     // '/usr/bin/node'
 * await which('./local-script')    // './local-script'
 * ```
 */
export async function which(
  binName: string,
  options?: WhichOptions,
): Promise<string | string[] | null> {
  // If binName is already a path (absolute or relative), return it as-is
  if (isPath(binName)) {
    return binName
  }

  try {
    // whichModule returns string when found, rejects when not found
    // whichModule is imported at the top
    /* c8 ignore next - External which call */
    const result = await whichModule(binName, options as any)
    return result as string | string[]
  } catch {
    // Binary not found in PATH
    return null
  }
}

/**
 * Find a binary in the system PATH and resolve to the real underlying script asynchronously.
 * Resolves wrapper scripts (.cmd, .ps1, shell scripts) to the actual .js files they execute.
 * @throws {Error} If the binary is not found and nothrow is false.
 *
 * @example
 * ```typescript
 * const npmPath = await whichReal('npm')
 * // e.g. '/usr/local/lib/node_modules/npm/bin/npm-cli.js'
 * ```
 */
export async function whichReal(
  binName: string,
  options?: WhichOptions,
): Promise<string | string[] | undefined> {
  const fs = getFs()
  // Default to nothrow: true if not specified to return undefined instead of throwing
  const opts = { nothrow: true, ...options }

  // Use cache - validate with existsSync() which is cheaper than full PATH search.
  if (opts.all) {
    // Check array cache for 'all: true' lookups.
    // Only validate first path for performance - if primary binary exists, assume others do too.
    const cachedAll = binPathAllCache.get(binName)
    if (cachedAll && cachedAll.length > 0) {
      if (fs.existsSync(cachedAll[0]!)) {
        return cachedAll
      }
      // Primary cached path no longer exists, remove stale entry.
      binPathAllCache.delete(binName)
    }
  } else {
    const cached = binPathCache.get(binName)
    if (cached) {
      if (fs.existsSync(cached)) {
        return cached
      }
      // Cached path no longer exists, remove stale entry.
      binPathCache.delete(binName)
    }
  }

  // Depending on options `whichModule` may throw if `binName` is not found.
  // With nothrow: true, it returns null when `binName` is not found.
  /* c8 ignore next - External which call */
  const result = await whichModule(
    binName,
    opts as import('./external/which').WhichOptions,
  )

  // When 'all: true' is specified, ensure we always return an array.
  if (opts?.all) {
    const paths = Array.isArray(result)
      ? result
      : typeof result === 'string'
        ? [result]
        : undefined
    // If all is true and we have paths, resolve each one.
    if (paths?.length) {
      const resolved = paths.map(p => resolveRealBinSync(p))
      // Cache the resolved paths.
      binPathAllCache.set(binName, resolved)
      return resolved
    }
    return paths
  }

  // If result is undefined (binary not found), return undefined
  if (!result) {
    return undefined
  }

  const resolved = resolveRealBinSync(result)
  // Cache the resolved path.
  binPathCache.set(binName, resolved)
  return resolved
}

/**
 * Find a binary in the system PATH and resolve to the real underlying script synchronously.
 * Resolves wrapper scripts (.cmd, .ps1, shell scripts) to the actual .js files they execute.
 * @throws {Error} If the binary is not found and nothrow is false.
 *
 * @example
 * ```typescript
 * const npmPath = whichRealSync('npm')
 * // e.g. '/usr/local/lib/node_modules/npm/bin/npm-cli.js'
 * ```
 */
export function whichRealSync(
  binName: string,
  options?: WhichOptions,
): string | string[] | undefined {
  const fs = getFs()
  // Default to nothrow: true if not specified to return undefined instead of throwing
  const opts = { nothrow: true, ...options }

  // Use cache - validate with existsSync() which is cheaper than full PATH search.
  if (opts.all) {
    // Check array cache for 'all: true' lookups.
    // Only validate first path for performance - if primary binary exists, assume others do too.
    const cachedAll = binPathAllCache.get(binName)
    if (cachedAll && cachedAll.length > 0) {
      if (fs.existsSync(cachedAll[0]!)) {
        return cachedAll
      }
      // Primary cached path no longer exists, remove stale entry.
      binPathAllCache.delete(binName)
    }
  } else {
    const cached = binPathCache.get(binName)
    if (cached) {
      if (fs.existsSync(cached)) {
        return cached
      }
      // Cached path no longer exists, remove stale entry.
      binPathCache.delete(binName)
    }
  }

  // Depending on options `which` may throw if `binName` is not found.
  // With nothrow: true, it returns null when `binName` is not found.
  const result = whichSync(binName, opts)

  // When 'all: true' is specified, ensure we always return an array.
  if (opts.all) {
    const paths = Array.isArray(result)
      ? result
      : typeof result === 'string'
        ? [result]
        : undefined
    // If all is true and we have paths, resolve each one.
    if (paths?.length) {
      const resolved = paths.map(p => resolveRealBinSync(p))
      // Cache the resolved paths.
      binPathAllCache.set(binName, resolved)
      return resolved
    }
    return paths
  }

  // If result is undefined (binary not found), return undefined
  if (!result) {
    return undefined
  }

  const resolved = resolveRealBinSync(result as string)
  // Cache the resolved path.
  binPathCache.set(binName, resolved)
  return resolved
}

/**
 * Find an executable in the system PATH synchronously.
 *
 * This function resolves binary names to their full paths by searching the system PATH.
 * It should only be used for binary names (not paths). If the input is already a path
 * (absolute or relative), it will be returned as-is without PATH resolution.
 *
 * Binary name vs. path detection:
 * - Binary names: 'npm', 'git', 'node' - will be resolved via PATH
 * - Absolute paths: '/usr/bin/node', 'C:\\Program Files\\nodejs\\node.exe' - returned as-is
 * - Relative paths: './node', '../bin/npm' - returned as-is
 *
 * @param {string} binName - The binary name to resolve (e.g., 'npm', 'git')
 * @param {WhichOptions | undefined} options - Options for resolution
 * @returns {string | string[] | null} The full path to the binary, the original path if input is a path, or null if not found
 *
 * @example
 * ```typescript
 * // Resolve binary names
 * whichSync('node')              // '/usr/local/bin/node'
 * whichSync('npm')               // '/usr/local/bin/npm'
 * whichSync('nonexistent')       // null
 *
 * // Paths are returned as-is
 * whichSync('/usr/bin/node')     // '/usr/bin/node'
 * whichSync('./local-script')    // './local-script'
 * ```
 */
export function whichSync(
  binName: string,
  options?: WhichOptions,
): string | string[] | null {
  // If binName is already a path (absolute or relative), return it as-is
  if (isPath(binName)) {
    return binName
  }

  try {
    // whichModule.sync returns string when found, throws when not found
    // whichModule is imported at the top
    const result = whichModule.sync(binName, options as any)
    return result as string | string[]
  } catch {
    // Binary not found in PATH
    return null
  }
}
