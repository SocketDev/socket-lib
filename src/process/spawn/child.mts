/**
 * @file Child process spawning utilities with cross-platform support. Provides
 *   enhanced spawn functionality with stdio handling and error management.
 *   SECURITY: Array-Based Arguments Prevent Command Injection This module uses
 *   array-based arguments for all command execution, which is the PRIMARY
 *   DEFENSE against command injection attacks. When you pass arguments as an
 *   array to spawn(): spawn('npx', ['sfw', tool, ...args], { shell: true })
 *   Node.js handles escaping automatically. Each argument is passed directly to
 *   the OS without shell interpretation. Shell metacharacters like ; | & $ ( )
 *   ` are treated as LITERAL STRINGS, not as commands. This approach is secure
 *   even when shell: true is used on Windows for .cmd/.bat file resolution.
 *   UNSAFE ALTERNATIVE (not used in this codebase): spawn(`npx sfw ${tool}
 *   ${args.join(' ')}`, { shell: true }) // ✖ VULNERABLE String concatenation
 *   allows injection. For example, if tool = "foo; rm -rf /", the shell would
 *   execute both commands. Array-based arguments prevent this. References:
 *
 *   - https://nodejs.org/api/child_process.html#child_processspawncommand-args-options
 *   - https://cheatsheetseries.owasp.org/cheatsheets/Nodejs_Security_Cheat_Sheet.html
 */

import process from 'node:process'

import { findPathEnvKey, replacePathInEnv } from '../../env/path.mjs'
import { getAbortSignal } from '../../process/abort.mjs'
import { getNodeChildProcess } from '../../node/child-process.mjs'
import { getOwn } from '../../objects/inspect.mjs'
import { peekDefaultSpinner } from '../../spinner/default-state.mjs'

import {
  getNpmCliPromiseSpawn,
  resolveSpawnBin,
  stripAnsiFromSpawnResult,
} from './shared.mjs'
import { enhanceSpawnError, isSpawnError } from './errors.mjs'
import { isStdioType } from './stdio.mjs'
import { runWithSpawnRetry } from './retry.mjs'
import { resolveSpawnTimeout } from './timeout.mjs'
import { maybeArmTreeKill } from './tree-kill-timer.mjs'

import type {
  BufferEncoding,
  NodeSpawnOptions,
  PromiseSpawnOptions,
  PromiseSpawnResult,
  SpawnExtra,
  SpawnOptions,
  SpawnResult,
  SpawnStdioResult,
  SpawnSyncOptions,
  SpawnSyncReturns,
} from './types.mjs'
// @ts-expect-error - external vendored module
import type npmCliPromiseSpawnType from '../../external/@npmcli/promise-spawn.js'

/**
 * Spawn a child process and return a promise that resolves when it completes,
 * with error handling, output capture, and cross-platform support.
 *
 * SECURITY: array-based arguments are the PRIMARY DEFENSE against command
 * injection. Everything in `args` reaches the OS without shell interpretation,
 * so shell metacharacters stay literal rather than becoming operators. That
 * holds even when `shell: true` is set for Windows .cmd/.bat execution,
 * because Node escapes each argument before handing it to the shell.
 *
 * @example
 *   // DO: array arguments stay safe however hostile userMessage is.
 *   spawn('git', ['commit', '-m', userMessage])
 *
 * @example
 *   // NEVER: concatenating into one string lets a crafted userMessage close
 *   // the quote and append a command of its own.
 *   spawn(`git commit -m "${userMessage}"`, { shell: true })
 *
 * @example
 *   // stdin is exposed for interactive processes.
 *   const result = spawn('cat', [])
 *   result.stdin?.write('Hello\n')
 *   result.stdin?.end()
 *   const { stdout } = await result
 *
 * @example
 *   // throws: false resolves with the non-zero code instead of rejecting,
 *   // so callers branch on `code` rather than try/catch.
 *   const { code } = await spawn('git', ['grep', '-q', needle], {
 *     throws: false,
 *   })
 *
 * @throws {SpawnError} When the process exits non-zero or a signal kills it —
 *   unless `throws: false`, which resolves with that result instead. A launch
 *   failure (`'ENOENT'`) always rejects.
 */
// Typed overloads — narrow the resolved stdout/stderr based on `stdioString`.
// Default (stdioString: true) → strings. `stdioString: false` → Buffers.
export function spawn(
  cmd: string,
  args?: string[] | readonly string[] | undefined,
): SpawnResult<string>
export function spawn(
  cmd: string,
  args: string[] | readonly string[] | undefined,
  options: SpawnOptions & { stdioString?: true | undefined },
  extra?: SpawnExtra | undefined,
): SpawnResult<string>
export function spawn(
  cmd: string,
  args: string[] | readonly string[] | undefined,
  options: SpawnOptions & { stdioString: false },
  extra?: SpawnExtra | undefined,
): SpawnResult<Buffer>
export function spawn(
  cmd: string,
  args?: string[] | readonly string[] | undefined,
  options?: SpawnOptions | undefined,
  extra?: SpawnExtra | undefined,
): SpawnResult
// This mirrors node's own child_process.spawn(command, args, options) on
// purpose: callers write spawn('git', ['push']) exactly as they would against
// the builtin, so the shape is fixed by that contract, not chosen here.
// oxlint-disable-next-line socket/no-optional-positional-trap -- node child_process contract.
export function spawn(
  cmd: string,
  args?: string[] | readonly string[] | undefined,
  options?: SpawnOptions | undefined,
  extra?: SpawnExtra | undefined,
): SpawnResult {
  const {
    spinner: optionsSpinner,
    stripAnsi: shouldStripAnsi = true,
    throws = true,
    ...rawSpawnOptions
  } = { __proto__: null, ...options } as SpawnOptions
  // Peek rather than getDefaultSpinner(): only interleave with a default
  // spinner that already exists. Forcing one into existence here would load
  // the whole spinner subsystem (yocto-spinner) on every spawn() call, even
  // for a caller — like a perry-compiled binary — that never shows one. An
  // explicit options.spinner still wins.
  const spinnerInstance = optionsSpinner ?? peekDefaultSpinner()
  const spawnOptions = { __proto__: null, ...rawSpawnOptions }
  const { env, shell, stdio, stdioString = true } = spawnOptions
  const cwd = spawnOptions.cwd ? String(spawnOptions.cwd) : undefined
  // Build the child environment before resolving: the PATH search must run
  // against the PATH the child will actually receive.
  // Preserve Windows process.env Proxy behavior when no custom env is provided.
  // On Windows, process.env is a Proxy that provides case-insensitive access
  // (PATH vs Path vs path). Spreading creates a plain object that loses this.
  // Only spread when we have custom environment variables to merge.
  const baseEnv = env
    ? ({
        __proto__: null,
        ...process.env,
        ...env,
      } as unknown as NodeJS.ProcessEnv)
    : process.env
  // Resolve a bare binary name against a search path the working directory
  // cannot supply. A path-like cmd passes through untouched. See
  // ./shared.resolveSpawnBin.
  const { command: actualCmd, searchPath } = resolveSpawnBin(cmd, {
    cwd,
    env: baseEnv,
    shell,
  })
  const envToUse =
    searchPath === undefined
      ? baseEnv
      : replacePathInEnv(baseEnv, searchPath, findPathEnvKey(baseEnv))
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
  const promiseSpawnOpts = {
    __proto__: null,
    cwd: typeof spawnOptions.cwd === 'string' ? spawnOptions.cwd : undefined,
    env: envToUse,
    signal: getAbortSignal(),
    stdio: spawnOptions.stdio,
    stdioString,
    shell: spawnOptions.shell,
    windowsVerbatimArguments: spawnOptions.windowsVerbatimArguments,
    // localTimeout (scaled) beats timeout (fixed); both throws. See ./timeout.
    timeout: resolveSpawnTimeout(spawnOptions),
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
  maybeArmTreeKill(oldSpawnPromise, spawnOptions as Record<string, unknown>)
  // The async IIFE wraps each transformation into a single
  // try/catch — same semantics as the previous .then/.catch chain,
  // expressed as straight-line async/await so the success and
  // failure paths read top-to-bottom.
  // shouldStripAnsi vs not branches; both arms exercised but the
  // 'code' in result and catch branches fire only on specific child-
  // process outcomes: exit-with-code or a throw.
  /* c8 ignore start */
  let newSpawnPromise: PromiseSpawnResult
  if (shouldStripAnsi && stdioString) {
    newSpawnPromise = (async () => {
      try {
        const result = await spawnPromise
        const strippedResult = stripAnsiFromSpawnResult(result)
        if ('code' in (strippedResult as { code?: number | undefined })) {
          ;(strippedResult as { code: number; exitCode: number }).exitCode = (
            strippedResult as { code: number }
          ).code
        }
        return strippedResult
      } catch (error) {
        const strippedError = stripAnsiFromSpawnResult(error)
        if (!throws) {
          const exitResult = spawnExitResult(strippedError)
          if (exitResult) {
            return exitResult
          }
        }
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
        if (!throws) {
          const exitResult = spawnExitResult(error)
          if (exitResult) {
            return exitResult
          }
        }
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
 * The resolved-result shape for a spawn rejection whose child actually RAN and
 * exited — a numeric exit code, or a terminating signal. This is what
 * `throws: false` resolves with instead of rejecting: the same
 * `cmd`/`args`/`code`/`signal`/`stdout`/`stderr` fields the success path
 * carries, plus the `exitCode` alias the success path also sets. A LAUNCH
 * failure — the command was never found or never started, so `.code` is a
 * string like `'ENOENT'` and no signal terminated it — returns undefined,
 * because there is no exit code to report and the rejection must stand.
 */
export function spawnExitResult(
  error: unknown,
): (SpawnStdioResult & { exitCode: number }) | undefined {
  if (!isSpawnError(error)) {
    return undefined
  }
  const { args, cmd, code, signal, stderr, stdout } = error
  if (typeof code !== 'number' && typeof signal !== 'string') {
    return undefined
  }
  // On a signal kill `code` is null at runtime; it passes through unchanged,
  // mirroring how the success path aliases `exitCode = code` verbatim.
  return {
    args,
    cmd,
    code,
    exitCode: code,
    signal,
    stderr,
    stdout,
  } as SpawnStdioResult & { exitCode: number }
}

/**
 * Synchronously spawn a child process and wait for it to complete, returning
 * all output and exit information.
 *
 * WARNING: this blocks the event loop. Use {@link spawn} for async work.
 *
 * @example
 *   // Basic synchronous spawn
 *   const result = spawnSync('git', ['status'])
 *   console.log(result.stdout)
 *   console.log(result.status) // exit code
 *
 * @example
 *   // With options
 *   const result = spawnSync('npm', ['install'], {
 *     cwd: '/path/to/project',
 *     stdioString: true,
 *   })
 *   if (result.status !== 0) {
 *     console.error(result.stderr)
 *   }
 *
 * @example
 *   // Get raw buffer output
 *   const result = spawnSync('cat', ['binary-file'], {
 *     stdioString: false,
 *   })
 *   console.log(result.stdout) // Buffer
 *
 * @example
 *   // Handle process errors
 *   const result = spawnSync('nonexistent-command')
 *   if (result.error) {
 *     console.error('Failed to spawn:', result.error)
 *   }
 *
 * @param {string} cmd - Command to execute.
 * @param {string[] | readonly string[] | undefined} args - Array of arguments.
 * @param {SpawnSyncOptions | undefined} options - Spawn options for process
 *   configuration.
 *
 * @returns {SpawnSyncReturns<string | Buffer>} Process result with exit code
 *   and captured output.
 */
// Typed overloads — narrow the return based on `stdioString` / `encoding`.
// Default behavior (stdioString: true, encoding: undefined) returns strings;
// passing `stdioString: false` or `encoding: 'buffer' | null` returns Buffers.
// Anything else (e.g. caller passes a runtime-computed options object) falls
// through to the untyped `string | Buffer` form.
export function spawnSync(
  cmd: string,
  args?: string[] | readonly string[] | undefined,
): SpawnSyncReturns<string>
export function spawnSync(
  cmd: string,
  args: string[] | readonly string[] | undefined,
  options: SpawnSyncOptions & {
    stdioString?: true | undefined
    encoding?: Exclude<BufferEncoding, never> | undefined
  },
): SpawnSyncReturns<string>
export function spawnSync(
  cmd: string,
  args: string[] | readonly string[] | undefined,
  options: SpawnSyncOptions & {
    stdioString: false
  },
): SpawnSyncReturns<Buffer>
export function spawnSync(
  cmd: string,
  args: string[] | readonly string[] | undefined,
  options: SpawnSyncOptions & {
    encoding: 'buffer' | null
  },
): SpawnSyncReturns<Buffer>
export function spawnSync(
  cmd: string,
  args?: string[] | readonly string[] | undefined,
  options?: SpawnSyncOptions | undefined,
): SpawnSyncReturns<string | Buffer>
export function spawnSync(
  cmd: string,
  args?: string[] | readonly string[] | undefined,
  options?: SpawnSyncOptions | undefined,
): SpawnSyncReturns<string | Buffer> {
  // Resolve a bare binary name against a search path the working directory
  // cannot supply, and hand back the PATH the child needs. A path-like cmd
  // passes through untouched. See ./shared.resolveSpawnBin.
  const optionsEnv = getOwn(options, 'env') as NodeJS.ProcessEnv | undefined
  const baseEnv = optionsEnv ?? process.env
  const { command: actualCmd, searchPath } = resolveSpawnBin(cmd, {
    cwd: getOwn(options, 'cwd') as string | undefined,
    env: baseEnv,
    shell: getOwn(options, 'shell') as boolean | string | undefined,
  })
  const {
    isRetryable,
    retries,
    retryDelayMs,
    retryFactor,
    retryMaxDelayMs,
    stripAnsi: shouldStripAnsi = true,
    trim = true,
    ...rawSpawnOptions
  } = {
    __proto__: null,
    ...options,
  } as SpawnSyncOptions
  const { stdioString: rawStdioString = true } = rawSpawnOptions
  const rawEncoding = rawStdioString ? 'utf8' : 'buffer'
  const spawnOptions = {
    encoding: rawEncoding,
    ...rawSpawnOptions,
    ...(searchPath === undefined
      ? {}
      : {
          env: replacePathInEnv(baseEnv, searchPath, findPathEnvKey(baseEnv)),
        }),
    // localTimeout (scaled) beats timeout (fixed); both throws. Node ignores the
    // stray localTimeout key on the options it receives. See ./timeout.
    timeout: resolveSpawnTimeout(rawSpawnOptions),
  } as NodeSpawnOptions & { encoding: BufferEncoding | 'buffer' }
  const stdioString = spawnOptions.encoding !== 'buffer'
  const childProcess = getNodeChildProcess()
  const retryOptions = {
    isRetryable,
    retries,
    retryDelayMs,
    retryFactor,
    retryMaxDelayMs,
  }
  // Retry is opt-in: with no `retries` this runs the command exactly once.
  // The wait between attempts is synchronous, because the whole call is.
  const result = runWithSpawnRetry(
    () =>
      // This IS the lib's sync spawn primitive; it must call the underlying
      // spawnSync.
      // oxlint-disable-next-line socket/prefer-async-spawn -- sync primitive
      childProcess.spawnSync(actualCmd, args, spawnOptions),
    retryOptions,
  )
  if (stdioString) {
    const { stderr, stdout } = result
    // `trim: false` keeps the decode byte-faithful — the default trim eats
    // the leading status column of `git status --porcelain` output. v7 may
    // flip the default to false; see SpawnSyncOptions.trim.
    if (stdout) {
      const text = stdout.toString()
      result.stdout = trim ? text.trim() : text
    }
    if (stderr) {
      const text = stderr.toString()
      result.stderr = trim ? text.trim() : text
    }
  }
  return (
    shouldStripAnsi && stdioString ? stripAnsiFromSpawnResult(result) : result
  ) as SpawnSyncReturns<string | Buffer>
}
