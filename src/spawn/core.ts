/**
 * @fileoverview Child process spawning utilities with cross-platform support.
 * Provides enhanced spawn functionality with stdio handling and error management.
 *
 * SECURITY: Array-Based Arguments Prevent Command Injection
 *
 * This module uses array-based arguments for all command execution, which is the
 * PRIMARY DEFENSE against command injection attacks. When you pass arguments as
 * an array to spawn():
 *
 *   spawn('npx', ['sfw', tool, ...args], { shell: true })
 *
 * Node.js handles escaping automatically. Each argument is passed directly to the
 * OS without shell interpretation. Shell metacharacters like ; | & $ ( ) ` are
 * treated as LITERAL STRINGS, not as commands. This approach is secure even when
 * shell: true is used on Windows for .cmd/.bat file resolution.
 *
 * UNSAFE ALTERNATIVE (not used in this codebase):
 *   spawn(`npx sfw ${tool} ${args.join(' ')}`, { shell: true })  // ✖ VULNERABLE
 *
 * String concatenation allows injection. For example, if tool = "foo; rm -rf /",
 * the shell would execute both commands. Array-based arguments prevent this.
 *
 * References:
 * - https://nodejs.org/api/child_process.html#child_processspawncommand-args-options
 * - https://cheatsheetseries.owasp.org/cheatsheets/Nodejs_Security_Cheat_Sheet.html
 */

import process from 'node:process'

import { whichSync } from '../bin/which'
import { getAbortSignal } from '../constants/process'
import { getNodeChildProcess } from '../node/child-process'
import { getNodeFs } from '../node/fs'
import { getNodePath } from '../node/path'
import { getOwn } from '../objects'
import { isPath } from '../paths/normalize'
import { RegExpPrototypeTest } from '../primordials/regexp'
import { getDefaultSpinner } from '../spinner/registry'

import {
  getNpmCliPromiseSpawn,
  spawnBinPathCache,
  stripAnsiFromSpawnResult,
  windowsScriptExtRegExp,
} from './_internals'
import { enhanceSpawnError } from './errors'
import { isStdioType } from './stdio'

import type {
  BufferEncoding,
  NodeSpawnOptions,
  PromiseSpawnOptions,
  PromiseSpawnResult,
  SpawnExtra,
  SpawnOptions,
  SpawnResult,
  SpawnSyncOptions,
  SpawnSyncReturns,
} from './types'
// @ts-expect-error - external vendored module
import type npmCliPromiseSpawnType from '../external/@npmcli/promise-spawn'

const abortSignal = getAbortSignal()
const spinner = getDefaultSpinner()

/**
 * Spawn a child process and return a promise that resolves when it completes.
 * Provides enhanced error handling, output capture, and cross-platform support.
 *
 * SECURITY: This function uses array-based arguments which prevent command injection.
 * Arguments in the `args` array are passed directly to the OS without shell
 * interpretation. Shell metacharacters (;|&$()`) are treated as literal strings,
 * not as commands or operators. This is the PRIMARY SECURITY DEFENSE.
 *
 * Even when shell: true is used (on Windows for .cmd/.bat execution), the array-based
 * approach remains secure because Node.js properly escapes each argument before passing
 * to the shell.
 *
 * @param {string} cmd - Command to execute (not user-controlled)
 * @param {string[] | readonly string[] | undefined} args - Array of arguments (safe even with user input)
 * @param {SpawnOptions | undefined} options - Spawn options for process configuration
 * @param {SpawnExtra | undefined} extra - Extra options for promise-spawn
 * @returns {SpawnResult} Promise that resolves with process exit information
 *
 * @throws {SpawnError} When the process exits with non-zero code or is terminated by signal
 *
 * @example
 * // Basic usage - spawn and wait for completion
 * const result = await spawn('git', ['status'])
 * console.log(result.stdout)
 *
 * @example
 * // With options - set working directory and environment
 * const result = await spawn('npm', ['install'], {
 *   cwd: '/path/to/project',
 *   env: { NODE_ENV: 'production' }
 * })
 *
 * @example
 * // ✔ DO THIS - Array-based arguments (safe)
 * spawn('git', ['commit', '-m', userMessage])
 * // Each argument is properly escaped, even if userMessage = "foo; rm -rf /"
 *
 * @example
 * // ✖ NEVER DO THIS - String concatenation (vulnerable)
 * spawn(`git commit -m "${userMessage}"`, { shell: true })
 * // Vulnerable to injection if userMessage = '"; rm -rf / #'
 *
 * @example
 * // Access stdin for interactive processes
 * const result = spawn('cat', [])
 * result.stdin?.write('Hello\n')
 * result.stdin?.end()
 * const { stdout } = await result
 * console.log(stdout) // 'Hello'
 *
 * @example
 * // Handle errors with exit codes
 * try {
 *   await spawn('exit', ['1'])
 * } catch (e) {
 *   if (isSpawnError(e)) {
 *     console.error(`Failed with code ${e.code}`)
 *     console.error(e.stderr)
 *   }
 * }
 */
export function spawn(
  cmd: string,
  args?: string[] | readonly string[],
  options?: SpawnOptions | undefined,
  extra?: SpawnExtra | undefined,
): SpawnResult {
  const {
    spinner: optionsSpinner = spinner,
    stripAnsi: shouldStripAnsi = true,
    ...rawSpawnOptions
  } = { __proto__: null, ...options } as SpawnOptions
  const spinnerInstance = optionsSpinner
  const spawnOptions = { __proto__: null, ...rawSpawnOptions }
  const { env, shell, stdio, stdioString = true } = spawnOptions
  const cwd = spawnOptions.cwd ? String(spawnOptions.cwd) : undefined
  // Resolve binary names to full paths using which.
  // If cmd is not a path (absolute or relative), resolve it via PATH.
  // If cmd is already a path, use it as-is.
  let actualCmd = cmd
  if (!isPath(cmd)) {
    // Binary name - check cache first, validate with existsSync().
    const fs = getNodeFs()
    const cached = spawnBinPathCache.get(cmd)
    // Cache hit fires only on second spawn() of the same binary;
    // stale-cache eviction fires only if the binary is removed
    // mid-session. The which-resolved arm fires when binary is in PATH.
    /* c8 ignore start */
    if (cached) {
      if (fs.existsSync(cached)) {
        actualCmd = cached
      } else {
        spawnBinPathCache.delete(cmd)
      }
    }
    if (actualCmd === cmd) {
      const resolved = whichSync(cmd, { cwd, nothrow: true })
      if (resolved && typeof resolved === 'string') {
        actualCmd = resolved
        spawnBinPathCache.set(cmd, resolved)
      }
    }
    /* c8 ignore stop */
    // If which returns null, keep original cmd and let spawn fail naturally
  }

  // Windows cmd.exe command resolution for .cmd/.bat/.ps1 files:
  //
  // When shell: true is used on Windows with script files (.cmd, .bat, .ps1),
  // cmd.exe can have issues executing full paths. The solution is to use just
  // the command basename without extension and let cmd.exe find it via PATH.
  //
  // How cmd.exe resolves commands:
  // 1. Searches current directory first
  // 2. Then searches each directory in PATH environment variable
  // 3. For each directory, tries extensions from PATHEXT (.COM, .EXE, .BAT, .CMD, etc.)
  // 4. Executes the first match found
  //
  // Example: Given 'C:\pnpm\pnpm.cmd' with shell: true
  // 1. Extract basename without extension: 'pnpm'
  // 2. cmd.exe searches PATH directories for 'pnpm'
  // 3. PATHEXT causes it to try 'pnpm.com', 'pnpm.exe', 'pnpm.bat', 'pnpm.cmd', etc.
  // 4. Finds and executes 'C:\pnpm\pnpm.cmd'
  //
  // This approach is consistent with how other tools handle Windows execution:
  // - npm's promise-spawn: uses which.sync() to find commands in PATH
  // - cross-spawn: spawns cmd.exe with escaped arguments
  // - execa: uses cross-spawn under the hood for Windows support
  //
  // See: https://github.com/nodejs/node/issues/3675
  // Inline WIN32 constant for coverage mode compatibility
  const WIN32 = process.platform === 'win32'
  /* c8 ignore start - Windows-only cmd.exe extension stripping for
     .cmd/.bat/.ps1 shell-true execution. Tested on Windows runners. */
  if (
    WIN32 &&
    shell &&
    RegExpPrototypeTest(windowsScriptExtRegExp, actualCmd)
  ) {
    // Only strip the extension if the command doesn't contain a path.
    // If it's an absolute or relative path, keep it intact so cmd.exe
    // executes the exact file. Stripping would fail for files in directories
    // not in PATH (e.g., temp directories, project-local bins).
    if (!isPath(actualCmd)) {
      // Extract just the command name without extension for PATH lookup.
      actualCmd = getNodePath().basename(
        actualCmd,
        getNodePath().extname(actualCmd),
      )
    }
  }
  /* c8 ignore stop */
  // The stdio option can be a string or an array.
  // https://nodejs.org/api/child_process.html#optionsstdio
  const wasSpinning = !!spinnerInstance?.isSpinning
  const shouldStopSpinner =
    wasSpinning &&
    !isStdioType(stdio as string | string[], 'ignore') &&
    !isStdioType(stdio as string | string[], 'pipe')
  const shouldRestartSpinner = shouldStopSpinner
  if (shouldStopSpinner) {
    spinnerInstance.stop()
  }
  // npmCliPromiseSpawn is lazily loaded via getNpmCliPromiseSpawn()
  // Use __proto__: null to prevent prototype pollution when passing to
  // third-party code, Node.js built-ins, or JavaScript built-in methods.
  // https://github.com/npm/promise-spawn
  // https://github.com/nodejs/node/blob/v24.0.1/lib/child_process.js#L674-L678
  // Preserve Windows process.env Proxy behavior when no custom env is provided.
  // On Windows, process.env is a Proxy that provides case-insensitive access
  // (PATH vs Path vs path). Spreading creates a plain object that loses this.
  // Only spread when we have custom environment variables to merge.
  const envToUse = env
    ? ({
        __proto__: null,
        ...process.env,
        ...env,
      } as unknown as NodeJS.ProcessEnv)
    : process.env

  const promiseSpawnOpts = {
    __proto__: null,
    cwd: typeof spawnOptions.cwd === 'string' ? spawnOptions.cwd : undefined,
    env: envToUse,
    signal: abortSignal,
    stdio: spawnOptions.stdio,
    stdioString,
    shell: spawnOptions.shell,
    windowsVerbatimArguments: spawnOptions.windowsVerbatimArguments,
    timeout: spawnOptions.timeout,
    uid: spawnOptions.uid,
    gid: spawnOptions.gid,
  } as unknown as PromiseSpawnOptions
  /* c8 ignore start - External npmCliPromiseSpawn call */
  const npmCliPromiseSpawn = getNpmCliPromiseSpawn()
  const spawnPromise = npmCliPromiseSpawn(
    actualCmd,
    args ? [...args] : [],
    promiseSpawnOpts as Parameters<typeof npmCliPromiseSpawnType>[2],
    extra,
  )
  /* c8 ignore stop */
  const oldSpawnPromise = spawnPromise
  // The async IIFE wraps each transformation into a single
  // try/catch — same semantics as the previous .then/.catch chain,
  // expressed as straight-line async/await so the success and
  // failure paths read top-to-bottom.
  // shouldStripAnsi vs not branches; both arms exercised but the
  // 'code' in result and catch branches fire only on specific child-
  // process outcomes (exit-with-code vs throw).
  /* c8 ignore start */
  let newSpawnPromise: PromiseSpawnResult
  if (shouldStripAnsi && stdioString) {
    newSpawnPromise = (async () => {
      try {
        const result = await spawnPromise
        const strippedResult = stripAnsiFromSpawnResult(result)
        if ('code' in (strippedResult as { code?: number })) {
          ;(strippedResult as { code: number; exitCode: number }).exitCode = (
            strippedResult as { code: number }
          ).code
        }
        return strippedResult
      } catch (error) {
        const strippedError = stripAnsiFromSpawnResult(error)
        throw enhanceSpawnError(strippedError)
      }
    })() as PromiseSpawnResult
  } else {
    newSpawnPromise = (async () => {
      try {
        const result = await spawnPromise
        if (result !== null && typeof result === 'object' && 'code' in result) {
          const res = result as typeof result & {
            exitCode: number
            code: number
          }
          res.exitCode = res.code
          return res
        }
        return result
      } catch (error) {
        throw enhanceSpawnError(error)
      }
    })() as PromiseSpawnResult
  }
  /* c8 ignore stop */
  if (shouldRestartSpinner) {
    // Wrap the previous transform in another async IIFE so the
    // spinner restart fires regardless of resolve/reject. Same
    // semantics as the prior .finally chain.
    const prevPromise = newSpawnPromise
    newSpawnPromise = (async () => {
      try {
        return await prevPromise
      } finally {
        spinnerInstance.start()
      }
    })() as PromiseSpawnResult
  }
  // Copy process and stdin properties from original promise. The
  // npm-cli-promise-spawn promise has these attached directly; the
  // wrapped promise above is a fresh Promise without them, so
  // forward them explicitly.
  ;(newSpawnPromise as unknown as PromiseSpawnResult).process =
    oldSpawnPromise.process
  ;(newSpawnPromise as unknown as PromiseSpawnResult).stdin = (
    oldSpawnPromise as unknown as PromiseSpawnResult
  ).stdin
  return newSpawnPromise as SpawnResult
}

/**
 * Synchronously spawn a child process and wait for it to complete.
 * Blocks execution until the process exits, returning all output and exit information.
 *
 * WARNING: This function blocks the event loop. Use {@link spawn} for async operations.
 *
 * @param {string} cmd - Command to execute
 * @param {string[] | readonly string[] | undefined} args - Array of arguments
 * @param {SpawnSyncOptions | undefined} options - Spawn options for process configuration
 * @returns {SpawnSyncReturns<string | Buffer>} Process result with exit code and captured output
 *
 * @example
 * // Basic synchronous spawn
 * const result = spawnSync('git', ['status'])
 * console.log(result.stdout)
 * console.log(result.status) // exit code
 *
 * @example
 * // With options
 * const result = spawnSync('npm', ['install'], {
 *   cwd: '/path/to/project',
 *   stdioString: true
 * })
 * if (result.status !== 0) {
 *   console.error(result.stderr)
 * }
 *
 * @example
 * // Get raw buffer output
 * const result = spawnSync('cat', ['binary-file'], {
 *   stdioString: false
 * })
 * console.log(result.stdout) // Buffer
 *
 * @example
 * // Handle process errors
 * const result = spawnSync('nonexistent-command')
 * if (result.error) {
 *   console.error('Failed to spawn:', result.error)
 * }
 */
export function spawnSync(
  cmd: string,
  args?: string[] | readonly string[],
  options?: SpawnSyncOptions | undefined,
): SpawnSyncReturns<string | Buffer> {
  // Resolve binary names to full paths using whichSync.
  // If cmd is not a path (absolute or relative), resolve it via PATH.
  // If cmd is already a path, use it as-is.
  let actualCmd = cmd
  if (!isPath(cmd)) {
    // Binary name - resolve via PATH using whichSync
    const resolved = whichSync(cmd, {
      cwd: getOwn(options, 'cwd') as string | undefined,
      nothrow: true,
    })
    if (resolved && typeof resolved === 'string') {
      actualCmd = resolved
    }
    // If whichSync returns null, keep original cmd and let spawn fail naturally
  }

  // Windows cmd.exe command resolution for .cmd/.bat/.ps1 files:
  // See spawn() function above for detailed explanation of this approach.
  const shell = getOwn(options, 'shell')
  // Inline WIN32 constant for coverage mode compatibility
  const WIN32 = process.platform === 'win32'
  /* c8 ignore start - Windows-only cmd.exe extension stripping for
     .cmd/.bat/.ps1 shell-true execution. Tested on Windows runners. */
  if (
    WIN32 &&
    shell &&
    RegExpPrototypeTest(windowsScriptExtRegExp, actualCmd)
  ) {
    // Only strip the extension if the command doesn't contain a path.
    // If it's an absolute or relative path, keep it intact so cmd.exe
    // executes the exact file. Stripping would fail for files in directories
    // not in PATH (e.g., temp directories, project-local bins).
    if (!isPath(actualCmd)) {
      // Extract just the command name without extension for PATH lookup.
      actualCmd = getNodePath().basename(
        actualCmd,
        getNodePath().extname(actualCmd),
      )
    }
  }
  /* c8 ignore stop */
  const { stripAnsi: shouldStripAnsi = true, ...rawSpawnOptions } = {
    __proto__: null,
    ...options,
  } as SpawnSyncOptions
  const { stdioString: rawStdioString = true } = rawSpawnOptions
  const rawEncoding = rawStdioString ? 'utf8' : 'buffer'
  const spawnOptions = {
    encoding: rawEncoding,
    ...rawSpawnOptions,
  } as NodeSpawnOptions & { encoding: BufferEncoding | 'buffer' }
  const stdioString = spawnOptions.encoding !== 'buffer'
  const result = getNodeChildProcess().spawnSync(actualCmd, args, spawnOptions)
  if (stdioString) {
    const { stderr, stdout } = result
    if (stdout) {
      result.stdout = stdout.toString().trim()
    }
    if (stderr) {
      result.stderr = stderr.toString().trim()
    }
  }
  return (
    shouldStripAnsi && stdioString ? stripAnsiFromSpawnResult(result) : result
  ) as SpawnSyncReturns<string | Buffer>
}
