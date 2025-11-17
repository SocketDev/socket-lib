/**
 * @fileoverview Binary path resolution and execution utilities for package managers.
 * Provides cross-platform bin path lookup, command execution, and path normalization.
 */

import fs from 'node:fs'
import path from 'node:path'

import { getHome } from './env/home'
import { getAppdata, getLocalappdata } from './env/windows'
import { getXdgDataHome } from './env/xdg'

import { WIN32 } from './constants/platform'
import whichModule from './external/which'
import { readJsonSync } from './fs'
import { isPath, normalizePath } from './paths/normalize'
import { spawn } from './spawn'

// ============================================================================
// Private Helper Functions
// ============================================================================

// ============================================================================
// Types and Interfaces
// ============================================================================

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

// ============================================================================
// Public API (alphabetically sorted)
// ============================================================================

/**
 * Execute a binary with the given arguments.
 */
/*@__NO_SIDE_EFFECTS__*/
export async function execBin(
  binPath: string,
  args?: string[],
  options?: import('./spawn').SpawnOptions,
) {
  // Resolve the binary path.
  const resolvedPath = isPath(binPath)
    ? resolveRealBinSync(binPath)
    : await whichReal(binPath)

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
 */
export function findRealBin(
  binName: string,
  commonPaths: string[] = [],
): string | undefined {
  // fs, path, and which are imported at the top

  // Try common locations first.
  for (const binPath of commonPaths) {
    if (fs.existsSync(binPath)) {
      return binPath
    }
  }

  // Fall back to whichModule.sync if no direct path found.
  const binPath = whichModule.sync(binName, { nothrow: true })
  if (binPath) {
    const binDir = path.dirname(binPath)

    if (isShadowBinPath(binDir)) {
      // This is likely a shadowed binary, try to find the real one.
      const allPaths =
        whichModule.sync(binName, { all: true, nothrow: true }) || []
      // Ensure allPaths is an array.
      const pathsArray = Array.isArray(allPaths)
        ? allPaths
        : typeof allPaths === 'string'
          ? [allPaths]
          : []

      for (const altPath of pathsArray) {
        const altDir = path.dirname(altPath)
        if (!isShadowBinPath(altDir)) {
          return altPath
        }
      }
    }
    return binPath
  }
  // If all else fails, return undefined to indicate binary not found.
  return undefined
}

/**
 * Find the real npm executable, bypassing any aliases and shadow bins.
 */
export function findRealNpm(): string {
  // fs and path are imported at the top

  // Try to find npm in the same directory as the node executable.
  const nodeDir = path.dirname(process.execPath)
  const npmInNodeDir = path.join(nodeDir, 'npm')

  if (fs.existsSync(npmInNodeDir)) {
    return npmInNodeDir
  }

  // Try common npm locations.
  const commonPaths = ['/usr/local/bin/npm', '/usr/bin/npm']
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
 */
export function findRealPnpm(): string {
  // path is imported at the top

  // Try common pnpm locations.
  const commonPaths = WIN32
    ? [
        // Windows common paths.
        path.join(getAppdata() as string, 'npm', 'pnpm.cmd'),
        path.join(getAppdata() as string, 'npm', 'pnpm'),
        path.join(getLocalappdata() as string, 'pnpm', 'pnpm.cmd'),
        path.join(getLocalappdata() as string, 'pnpm', 'pnpm'),
        'C:\\Program Files\\nodejs\\pnpm.cmd',
        'C:\\Program Files\\nodejs\\pnpm',
      ].filter(Boolean)
    : [
        // Unix common paths.
        '/usr/local/bin/pnpm',
        '/usr/bin/pnpm',
        path.join(
          (getXdgDataHome() as string) || `${getHome() as string}/.local/share`,
          'pnpm/pnpm',
        ),
        path.join(getHome() as string, '.pnpm/pnpm'),
      ].filter(Boolean)

  return findRealBin('pnpm', commonPaths) ?? ''
}

/**
 * Find the real yarn executable, bypassing any aliases and shadow bins.
 */
export function findRealYarn(): string {
  // path is imported at the top

  // Try common yarn locations.
  const commonPaths = [
    '/usr/local/bin/yarn',
    '/usr/bin/yarn',
    path.join(getHome() as string, '.yarn/bin/yarn'),
    path.join(
      getHome() as string,
      '.config/yarn/global/node_modules/.bin/yarn',
    ),
  ].filter(Boolean)

  return findRealBin('yarn', commonPaths) ?? ''
}

/**
 * Check if a directory path contains any shadow bin patterns.
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
 */
export function resolveRealBinSync(binPath: string): string {
  // fs and path are imported at the top

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
      try {
        return normalizePath(fs.realpathSync.native(voltaBinPath))
      } catch {}
      return voltaBinPath
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
 */
export async function whichReal(
  binName: string,
  options?: WhichOptions,
): Promise<string | string[] | undefined> {
  // whichModule is imported at the top
  // Default to nothrow: true if not specified to return undefined instead of throwing
  const opts = { nothrow: true, ...options }
  // Depending on options `whichModule` may throw if `binName` is not found.
  // With nothrow: true, it returns null when `binName` is not found.
  const result = await whichModule(binName, opts)

  // When 'all: true' is specified, ensure we always return an array.
  if (opts?.all) {
    const paths = Array.isArray(result)
      ? result
      : typeof result === 'string'
        ? [result]
        : undefined
    // If all is true and we have paths, resolve each one.
    return paths?.length ? paths.map(p => resolveRealBinSync(p)) : paths
  }

  // If result is undefined (binary not found), return undefined
  if (!result) {
    return undefined
  }

  return resolveRealBinSync(result)
}

/**
 * Find a binary in the system PATH and resolve to the real underlying script synchronously.
 * Resolves wrapper scripts (.cmd, .ps1, shell scripts) to the actual .js files they execute.
 * @throws {Error} If the binary is not found and nothrow is false.
 */
export function whichRealSync(
  binName: string,
  options?: WhichOptions,
): string | string[] | undefined {
  // Default to nothrow: true if not specified to return undefined instead of throwing
  const opts = { nothrow: true, ...options }
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
    return paths?.length ? paths.map(p => resolveRealBinSync(p)) : paths
  }

  // If result is undefined (binary not found), return undefined
  if (!result) {
    return undefined
  }

  return resolveRealBinSync(result as string)
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
