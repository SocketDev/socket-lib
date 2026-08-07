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

import { findPathEnvKey, replacePathInEnv } from '../../env/path'
import { getAbortSignal } from '../../process/abort'
import { getNodeChildProcess } from '../../node/child-process'
import { getOwn } from '../../objects/inspect'
import { getDefaultSpinner } from '../../spinner/default'

import {
  getNpmCliPromiseSpawn,
  resolveSpawnBin,
  stripAnsiFromSpawnResult,
} from './shared'
import { enhanceSpawnError } from './errors'
import { isStdioType } from './stdio'
import { resolveSpawnTimeout } from './timeout'

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
import type npmCliPromiseSpawnType from '../../external/@npmcli/promise-spawn'

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
 * @throws {SpawnError} When the process exits non-zero or a signal kills it.
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
    ...rawSpawnOptions
  } = { __proto__: null, ...options } as SpawnOptions
  // Lazily acquire the default spinner at call time rather than capturing it at
  // module-eval. Constructing it at import time pins a native handle into the
  // module, which aborts V8 --build-snapshot of anything that transitively
  // imports this module. An explicit options.spinner still wins.
  const spinnerInstance = optionsSpinner ?? getDefaultSpinner()
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
  const { stripAnsi: shouldStripAnsi = true, ...rawSpawnOptions } = {
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
  // This IS the lib's sync spawn primitive; it must call the underlying
  // spawnSync.
  // oxlint-disable-next-line socket/prefer-async-spawn -- sync primitive
  const result = childProcess.spawnSync(actualCmd, args, spawnOptions)
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
