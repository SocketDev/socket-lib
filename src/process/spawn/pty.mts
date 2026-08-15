/**
 * @file Zero-dependency PTY runner: run a command under a pseudo-terminal using
 *   the system `script` binary, no `node-pty` and no native addon. It belongs
 *   in the spawn family beside spawn/child, spawn/timeout, and spawn/kill-tree
 *   — it is spawn-under-a-PTY. A PTY makes a child believe it has a real
 *   terminal, so tools that gate interactive or web-auth flows on `isTTY`
 *   behave as they do for a human. The `script` binary is the portable,
 *   dependency-free way to get one: macOS and the BSDs take the command as
 *   trailing args after the typescript file, `script -q /dev/null <cmd...>`;
 *   util-linux takes it through `-c`, `script -q -c "<cmd>" /dev/null`. Windows
 *   has no `script`, so `buildPtyInvocation` returns undefined there and
 *   callers fall back to a direct spawn. `buildPtyInvocation` is a pure,
 *   exported function so the per-platform shape is unit-testable without a PTY;
 *   `ptyRun` spawns the invocation through node:child_process, accumulates
 *   stdout/stderr, streams each chunk to optional callbacks, and resolves the
 *   child's exit code.
 */

import process from 'node:process'

import { getNodeChildProcess } from '../../node/child-process.mjs'
import { getNodeFs } from '../../node/fs.mjs'

import type { ChildProcess } from 'node:child_process'

/**
 * Environment entries that quiet a PTY child's rendering without breaking its
 * interactivity. A PTY makes the child believe a human is watching, which is
 * what keeps browser-based auth prompts alive — but it also re-enables every
 * spinner and redraw the child suppresses when piped; a progress display can
 * write gigabytes of frames into a captured PTY in minutes.
 *
 * Two obvious knobs are wrong here, both learned the hard way:
 *
 * - `CI=1` — tools read it as "no human here" and refuse the interactive flows
 *   the PTY exists to preserve.
 * - `TERM=dumb` — under script(1) it drives `process.stdout.columns` to 0, and
 *   width-aware rendering dies on that before printing a line.
 *
 * NO_COLOR is the safe one: it strips the per-character truecolor escapes
 * that make up the bulk of the frame spam while leaving the terminal usable.
 */
export const NON_INTERACTIVE_RENDER_ENV: NodeJS.ProcessEnv = {
  NO_COLOR: '1',
}

/**
 * A concrete `script`-based invocation: the binary to spawn plus its argv. The
 * caller feeds these straight to a child-process spawn.
 */
export interface PtyInvocation {
  readonly command: string
  readonly args: readonly string[]
}

/**
 * Options for {@link ptyRun}. `platform` is injectable so a test can exercise a
 * non-host branch; it defaults to `process.platform`. `onStdout`/`onStderr`
 * receive each decoded chunk as it arrives, the streaming boundary that keeps
 * the runner from hard-wiring writes to the parent's stdout.
 */
export interface PtyRunOptions {
  readonly cwd?: string | undefined
  readonly env?: NodeJS.ProcessEnv | undefined
  readonly onStderr?: ((chunk: string) => void) | undefined
  readonly onStdout?: ((chunk: string) => void) | undefined
  readonly platform?: NodeJS.Platform | undefined
  readonly signal?: AbortSignal | undefined
}

/**
 * The resolved outcome of a {@link ptyRun}: the fully accumulated stdout and
 * stderr text plus the child's exit code. A non-zero exit is a result, never a
 * throw, so callers branch on `exitCode`.
 */
export interface PtyRunResult {
  readonly exitCode: number
  readonly stderr: string
  readonly stdout: string
}

/**
 * Build the `script`-based PTY invocation that runs `command` with `args` under
 * a pseudo-terminal. macOS and the BSDs take the command as trailing args after
 * the typescript file; util-linux takes it through `-c`. Returns undefined on
 * platforms without `script` — notably win32 — where the caller falls back to a
 * direct spawn.
 */
export function buildPtyInvocation(
  platform: NodeJS.Platform,
  command: string,
  args: readonly string[],
): PtyInvocation | undefined {
  if (platform === 'win32') {
    return undefined
  }
  if (platform === 'linux') {
    const inner = [command, ...args].map(quoteForShell).join(' ')
    return { command: 'script', args: ['-q', '-c', inner, '/dev/null'] }
  }
  // macOS and the BSDs: `script -q /dev/null <command> <args...>`.
  return { command: 'script', args: ['-q', '/dev/null', command, ...args] }
}

/**
 * Run `command` with `args` under a PTY via the system `script` binary. Streams
 * each decoded stdout/stderr chunk to the matching callback as it arrives, and
 * resolves with the fully accumulated output plus the exit code. Rejects only
 * when the child fails to spawn — a non-zero exit resolves with that code.
 * Throws synchronously via a rejected promise when the platform has no `script`
 * binary, so callers on win32 should check {@link buildPtyInvocation} first.
 */
export async function ptyRun(
  command: string,
  args: readonly string[],
  options?: PtyRunOptions | undefined,
): Promise<PtyRunResult> {
  const {
    cwd,
    env,
    onStderr,
    onStdout,
    platform = process.platform,
    signal,
  } = { __proto__: null, ...options } as PtyRunOptions
  const invocation = buildPtyInvocation(platform, command, [...args])
  if (!invocation) {
    throw new Error(
      `ptyRun: no PTY available on platform '${platform}' — the system 'script' binary is required`,
    )
  }
  // Alias the raw node spawn so it is clearly the child-process primitive, not
  // the lib's enriched spawn wrapper — the raw one returns a ChildProcess whose
  // .stdout/.stderr/.on surface is exactly what PTY streaming needs.
  const { spawn: nodeSpawn } = getNodeChildProcess()
  return await new Promise<PtyRunResult>((resolve, reject) => {
    const child: ChildProcess = nodeSpawn(
      invocation.command,
      [...invocation.args],
      {
        cwd,
        env,
        signal,
        stdio: ['inherit', 'pipe', 'pipe'],
      },
    )
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      stdout += text
      onStdout?.(text)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      stderr += text
      onStderr?.(text)
    })
    child.on('error', reject)
    child.on('close', (code: number | null) => {
      resolve({ exitCode: code ?? 1, stderr, stdout })
    })
  })
}

/**
 * Run a PTY child in pipe-pump form: {@link ptyRun} already gives the child a
 * PIPE (never the parent's stdout directly), so pumping is just default
 * stream callbacks that write each chunk on to the parent's own
 * stdout/stderr. This is the lane for a file-backed stdout — a `> file`
 * redirect or an agent harness capturing to disk — where script(1) cannot
 * allocate a pseudo-terminal onto the fd: it prints `tcgetattr/ioctl:
 * Operation not supported` and the child exits 1 having produced NO output,
 * which reads as "the command failed" when the command never ran. Check
 * {@link stdoutIsFileBacked} to pick this lane. Caller-supplied
 * `onStdout`/`onStderr` still observe every chunk after it is forwarded.
 */
export async function ptyRunPumped(
  command: string,
  args: readonly string[],
  options?: PtyRunOptions | undefined,
): Promise<PtyRunResult> {
  const opts = { __proto__: null, ...options } as PtyRunOptions
  return await ptyRun(command, args, {
    ...opts,
    onStderr: (chunk: string) => {
      process.stderr.write(chunk)
      opts.onStderr?.(chunk)
    },
    onStdout: (chunk: string) => {
      process.stdout.write(chunk)
      opts.onStdout?.(chunk)
    },
  })
}

/**
 * Single-quote a token for the util-linux `script -c` command string. Array
 * spawn args stay unquoted; only the Linux `-c` path joins tokens into one
 * shell string, so this is the one place a token needs escaping.
 */
export function quoteForShell(token: string): string {
  return `'${token.replaceAll("'", `'\\''`)}'`
}

/**
 * True when the given fd (default: this process's stdout, fd 1) is a regular
 * FILE — a `> out.log` redirect, or an agent harness that captures a
 * background task to disk — rather than a tty or a pipe.
 *
 * Script(1) cannot drive a pseudo-terminal into a file-backed stdout: it
 * prints `tcgetattr/ioctl: Operation not supported on socket` and the child
 * exits 1 having produced NO output at all. That reads as "the command
 * failed" when the command never ran, so callers check this first and route
 * a file-backed stdout through {@link ptyRunPumped}. Returns false when the
 * fd cannot be stat'ed.
 */
export function stdoutIsFileBacked(fd: number = 1): boolean {
  try {
    const fs = getNodeFs()
    return fs.fstatSync(fd).isFile()
  } catch {
    return false
  }
}
