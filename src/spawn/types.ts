/**
 * @fileoverview Public type surface for `spawn/*` modules.
 *
 * Most of this is straight Node.js child_process types duplicated so
 * the lib doesn't carry a hard `@types/node` requirement at the
 * surface. The `Spawn*` types layer Socket-specific options on top:
 *
 *   - `SpawnOptions.spinner` lets the caller pause an outer spinner
 *     while the child runs (so progress output isn't smeared by the
 *     spinner's redraw loop).
 *   - `SpawnOptions.stripAnsi` defaults to true — most consumers want
 *     plain text from captured output. Pass false only when the
 *     output is being forwarded to a terminal directly.
 *   - `SpawnOptions.stdioString` defaults to true — string output is
 *     ergonomic; opt out for binary streams.
 *
 * `PromiseSpawnResult` is the upstream `@npmcli/promise-spawn` shape:
 * a Promise enriched with `process` + `stdin` accessors so callers can
 * reach into the running child without re-spawning.
 */

import type { SendHandle, Serializable, StdioOptions } from 'node:child_process'
import type { EventEmitter } from 'node:events'

import type { Remap } from '../objects/types'
import type { SpinnerInstance } from '../spinner/types'

// Define BufferEncoding type for TypeScript compatibility.
export type BufferEncoding = globalThis.BufferEncoding

/**
 * Options for spawning a child process with promise-based completion.
 *
 * @property {string | undefined} cwd - Current working directory for the process
 * @property {NodeJS.ProcessEnv | undefined} env - Environment variables for the process
 * @property {number | undefined} gid - Group identity of the process (POSIX only)
 * @property {boolean | string | undefined} shell - Whether to run command in shell, or path to shell
 * @property {AbortSignal | undefined} signal - Signal to abort the process
 * @property {StdioType | undefined} stdio - Stdio configuration (`'pipe'`, `'ignore'`, `'inherit'`, or array)
 * @property {boolean | undefined} stdioString - Convert stdio output to strings (default: `true`)
 * @property {number | undefined} timeout - Maximum time in milliseconds before killing the process
 * @property {number | undefined} uid - User identity of the process (POSIX only)
 * @property {boolean | undefined} windowsVerbatimArguments - Don't quote or escape arguments on Windows (requires shell: true). Use when you need exact argument control. Default: false
 */
export type PromiseSpawnOptions = {
  cwd?: string | undefined
  env?: NodeJS.ProcessEnv | undefined
  gid?: number | undefined
  shell?: boolean | string | undefined
  signal?: AbortSignal | undefined
  stdio?: StdioType | undefined
  stdioString?: boolean | undefined
  timeout?: number | undefined
  uid?: number | undefined
  windowsVerbatimArguments?: boolean | undefined
}

/**
 * Result returned by {@link spawn} when the child process completes.
 * This is a Promise that resolves with process exit information and output,
 * with additional properties for accessing the running process and stdin stream.
 *
 * @property {ChildProcess} process - The running child process instance
 * @property {WritableStreamType | null} stdin - Writable stream for process stdin, or `null` if not piped
 *
 * @example
 * const result = spawn('echo', ['hello'])
 * result.stdin?.write('additional input\n')
 * const { code, stdout } = await result
 * console.log(stdout) // 'hello'
 */
export type PromiseSpawnResult = Promise<{
  cmd: string
  args: string[] | readonly string[]
  code: number
  signal: NodeJS.Signals | null
  stdout: string | Buffer
  stderr: string | Buffer
}> & {
  process: ChildProcess
  stdin: WritableStreamType | null
}

/**
 * Error object thrown when a spawned process fails.
 * Extends the standard Error with process-specific information including exit code,
 * signal, command details, and captured output.
 *
 * @property {string[]} args - Arguments passed to the command
 * @property {string} cmd - Command that was executed
 * @property {number} code - Process exit code
 * @property {string} name - Error name (typically `'Error'`)
 * @property {string} message - Error message describing the failure
 * @property {NodeJS.Signals | null} signal - Signal that terminated the process, if any
 * @property {string} stack - Stack trace of the error
 * @property {string | Buffer} stderr - Standard error output from the process
 * @property {string | Buffer} stdout - Standard output from the process
 *
 * @example
 * try {
 *   await spawn('exit', ['1'])
 * } catch (e) {
 *   if (isSpawnError(e)) {
 *     console.error(`Command failed with code ${e.code}`)
 *     console.error(`stderr: ${e.stderr}`)
 *   }
 * }
 */
export type SpawnError = {
  args: string[]
  cmd: string
  code: number
  name: string
  message: string
  signal: NodeJS.Signals | null
  stack: string
  stderr: string | Buffer
  stdout: string | Buffer
}

/**
 * Spawn error variant where stdout and stderr are guaranteed to be strings.
 * This type is used when `stdioString: true` is set in spawn options.
 *
 * @property {string} stdout - Standard output as a string
 * @property {string} stderr - Standard error as a string
 */
export type SpawnErrorWithOutputString = SpawnError & {
  stdout: string
  stderr: string
}

/**
 * Spawn error variant where stdout and stderr are guaranteed to be Buffers.
 * This type is used when `stdioString: false` is set in spawn options.
 *
 * @property {Buffer} stdout - Standard output as a Buffer
 * @property {Buffer} stderr - Standard error as a Buffer
 */
export type SpawnErrorWithOutputBuffer = SpawnError & {
  stdout: Buffer
  stderr: Buffer
}

/**
 * Extra options passed to the underlying promise-spawn implementation.
 * This is an open-ended object for passing additional metadata or configuration.
 */
export type SpawnExtra = Record<string, unknown>

/**
 * Valid values for individual stdio streams.
 * - `'pipe'` - Creates a pipe between child and parent (default)
 * - `'ignore'` - Ignores the stream
 * - `'inherit'` - Uses parent's stream
 * - `'overlapped'` - Windows-specific overlapped I/O
 */
export type IOType = 'pipe' | 'ignore' | 'inherit' | 'overlapped'

/**
 * Configuration for process stdio (stdin, stdout, stderr) streams.
 * Can be a single value applied to all streams, or an array specifying each stream individually.
 * - `'ipc'` - Creates an IPC channel for communication with the parent
 *
 * @example
 * // All streams piped
 * stdio: 'pipe'
 *
 * @example
 * // Custom configuration per stream: [stdin, stdout, stderr]
 * stdio: ['ignore', 'pipe', 'pipe']
 */
export type StdioType = IOType | 'ipc' | Array<IOType | 'ipc'>

/**
 * Result object returned by {@link spawnSync} when the child process completes synchronously.
 *
 * @template T - Type of stdout/stderr (string or Buffer)
 * @property {number} pid - Process ID of the spawned child
 * @property {Array<T | null>} output - Array containing stdout/stderr values
 * @property {T} stdout - Standard output from the process
 * @property {T} stderr - Standard error from the process
 * @property {number | null} status - Exit code, or `null` if killed by signal
 * @property {NodeJS.Signals | null} signal - Signal that terminated the process, or `null`
 * @property {Error | undefined} error - Error object if the spawn failed
 */
export interface SpawnSyncReturns<T> {
  pid: number
  output: Array<T | null>
  stdout: T
  stderr: T
  status: number | null
  signal: NodeJS.Signals | null
  error?: Error | undefined
}

/*@__NO_SIDE_EFFECTS__*/
// Duplicated from Node.js child_process.SpawnOptions
// These are the options passed to child_process.spawn()
export interface NodeSpawnOptions {
  cwd?: string | URL | undefined
  env?: NodeJS.ProcessEnv | undefined
  argv0?: string | undefined
  stdio?: StdioOptions | undefined
  detached?: boolean | undefined
  uid?: number | undefined
  gid?: number | undefined
  serialization?: 'json' | 'advanced' | undefined
  shell?: boolean | string | undefined
  windowsVerbatimArguments?: boolean | undefined
  windowsHide?: boolean | undefined
  signal?: AbortSignal | undefined
  timeout?: number | undefined
  killSignal?: NodeJS.Signals | number | undefined
}

/*@__NO_SIDE_EFFECTS__*/
// Duplicated from Node.js child_process.SpawnSyncOptions. Mirrors
// Node's split: the sync API adds `input`, `maxBuffer`, and `encoding`
// on top of the common spawn options. Async spawn doesn't accept these
// — `input` would be meaningless without a sync write to stdin —
// so they live on a separate interface to keep the async type honest.
export interface NodeSpawnSyncOptions extends NodeSpawnOptions {
  input?: string | NodeJS.ArrayBufferView | undefined
  maxBuffer?: number | undefined
  encoding?: BufferEncoding | 'buffer' | null | undefined
}

// Duplicated from Node.js child_process.ChildProcess
// This represents a spawned child process
export interface ChildProcess extends EventEmitter {
  stdin: NodeJS.WritableStream | null
  stdout: NodeJS.ReadableStream | null
  stderr: NodeJS.ReadableStream | null
  readonly channel?: unknown
  readonly stdio: [
    NodeJS.WritableStream | null,
    NodeJS.ReadableStream | null,
    NodeJS.ReadableStream | null,
    NodeJS.ReadableStream | NodeJS.WritableStream | null | undefined,
    NodeJS.ReadableStream | NodeJS.WritableStream | null | undefined,
  ]
  readonly killed: boolean
  readonly pid?: number | undefined
  readonly connected: boolean
  readonly exitCode: number | null
  readonly signalCode: NodeJS.Signals | null
  readonly spawnargs: string[]
  readonly spawnfile: string
  kill(signal?: NodeJS.Signals | number): boolean
  send(message: Serializable, callback?: (error: Error | null) => void): boolean
  send(
    message: Serializable,
    sendHandle?: SendHandle | undefined,
    callback?: (error: Error | null) => void,
  ): boolean
  send(
    message: Serializable,
    sendHandle?: SendHandle | undefined,
    options?: { keepOpen?: boolean | undefined } | undefined,
    callback?: (error: Error | null) => void,
  ): boolean
  disconnect(): void
  unref(): void
  ref(): void
}

// Duplicated from Node.js stream.Writable
export interface WritableStreamType {
  writable: boolean
  writableEnded: boolean
  writableFinished: boolean
  writableHighWaterMark: number
  writableLength: number
  writableObjectMode: boolean
  writableCorked: number
  destroyed: boolean
  write(
    chunk: unknown,
    encoding?: BufferEncoding | undefined,
    callback?: (error?: Error | null) => void,
  ): boolean
  write(chunk: unknown, callback?: (error?: Error | null) => void): boolean
  end(cb?: () => void): this
  end(chunk: unknown, cb?: () => void): this
  end(
    chunk: unknown,
    encoding?: BufferEncoding | undefined,
    cb?: () => void,
  ): this
  cork(): void
  uncork(): void
  destroy(error?: Error | undefined): this
}

/**
 * Options for spawning a child process with {@link spawn}.
 * Extends Node.js spawn options with additional Socket-specific functionality.
 *
 * @property {string | URL | undefined} cwd - Current working directory
 * @property {NodeJS.ProcessEnv | undefined} env - Environment variables
 * @property {number | undefined} gid - Group identity (POSIX)
 * @property {boolean | string | undefined} shell - Run command in shell
 * @property {AbortSignal | undefined} signal - Abort signal
 * @property {import('../spinner/types').SpinnerInstance | undefined} spinner - Spinner instance to pause during execution
 * @property {StdioType | undefined} stdio - Stdio configuration
 * @property {boolean | undefined} stdioString - Convert output to strings (default: `true`)
 * @property {boolean | undefined} stripAnsi - Remove ANSI codes from output (default: `true`)
 * @property {number | undefined} timeout - Timeout in milliseconds
 * @property {number | undefined} uid - User identity (POSIX)
 * @property {boolean | undefined} windowsVerbatimArguments - Don't quote or escape arguments on Windows (requires shell: true). Use when you need exact argument control. Default: false
 */
export type SpawnOptions = Remap<
  NodeSpawnOptions & {
    spinner?: SpinnerInstance | undefined
    stdioString?: boolean
    stripAnsi?: boolean
  }
>
export type SpawnResult = PromiseSpawnResult
/**
 * Result object returned when a spawned process completes.
 *
 * @property {string} cmd - Command that was executed
 * @property {string[] | readonly string[]} args - Arguments passed to the command
 * @property {number} code - Process exit code
 * @property {NodeJS.Signals | null} signal - Signal that terminated the process, if any
 * @property {string | Buffer} stdout - Standard output (string if `stdioString: true`, Buffer otherwise)
 * @property {string | Buffer} stderr - Standard error (string if `stdioString: true`, Buffer otherwise)
 */
export type SpawnStdioResult = {
  cmd: string
  args: string[] | readonly string[]
  code: number
  signal: NodeJS.Signals | null
  stdout: string | Buffer
  stderr: string | Buffer
}

/**
 * Options for synchronously spawning a child process with {@link spawnSync}.
 *
 * Mirrors {@link SpawnOptions} (stdioString, stripAnsi) but builds on
 * Node's sync option shape ({@link NodeSpawnSyncOptions}) — which adds
 * `input`, `maxBuffer`, and `encoding` that the async API doesn't have.
 * The `spinner` field is excluded (not applicable for synchronous execution).
 */
export type SpawnSyncOptions = Remap<
  NodeSpawnSyncOptions & {
    stdioString?: boolean
    stripAnsi?: boolean
  }
>
