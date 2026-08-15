/**
 * @file Script-style run lanes over spawn/child: `runInherit` forwards stdio
 *   and resolves the exit code, `runCapture` collects stdout while stderr
 *   stays visible, and `runInheritTee` forwards the live stream AND keeps a
 *   copy — the lane a failure handler needs when the operator watched the
 *   output but the code still has to inspect what was said.
 *   `waitForStdioFlush` drains inherited stdio handles before a process exits.
 *   Every lane is built on spawn's `throws: false`, so a non-zero exit is a
 *   RESULT here, never a rejection to swallow; only a LAUNCH failure (the
 *   command never ran — `'ENOENT'`) rejects. No lane logs anything: each
 *   returns data and the caller decides what to print. The working directory
 *   is always a parameter — nothing here assumes a repo root.
 */

import process from 'node:process'

import { isWin32 } from '../../constants/platform.mjs'

import { spawn } from './child.mjs'

/**
 * What {@link runCapture} resolves with: the exit code plus the collected
 * stdout text, byte-faithful (no trim — a caller that wants trimmed text
 * trims it).
 */
export interface CapturedRun {
  code: number
  stdout: string
}

/**
 * Options shared by the run lanes. `cwd` is a plain parameter — these lanes
 * carry no notion of a repo root — and `env` entries are merged over the
 * parent's environment by spawn itself.
 */
export interface RunOptions {
  readonly cwd?: string | undefined
  readonly env?: NodeJS.ProcessEnv | undefined
}

/**
 * What {@link runInheritTee} resolves with: the exit code plus everything the
 * child wrote, stdout and stderr interleaved in arrival order.
 */
export interface TeedRun {
  code: number
  output: string
}

/**
 * Options for {@link runInheritTee}. `onStdout`/`onStderr` are the forwarding
 * boundary: each raw chunk goes to the matching sink as it arrives, defaulting
 * to the parent's own stdout/stderr so the operator sees the stream live. A
 * test injects sinks to observe the forwarding without touching the real
 * streams.
 */
export interface TeeRunOptions extends RunOptions {
  readonly onStderr?: ((chunk: Buffer) => void) | undefined
  readonly onStdout?: ((chunk: Buffer) => void) | undefined
}

/**
 * Spawn a command and capture stdout. Stderr goes to the parent process's
 * stderr so error messages stay visible; stdin is ignored. Resolves the
 * collected stdout plus the exit code — a non-zero exit is a result, not a
 * throw, because for one-shot queries (`git rev-parse`, `npm view`,
 * `pnpm stage list --json`) the non-zero exit often IS the answer. Rejects
 * only when the command never launched.
 */
export async function runCapture(
  cmd: string,
  args: string[] | readonly string[],
  options?: RunOptions | undefined,
): Promise<CapturedRun> {
  const { cwd, env } = { __proto__: null, ...options } as RunOptions
  const result = await spawn(cmd, args, {
    cwd,
    env,
    shell: isWin32(),
    stdio: ['ignore', 'pipe', 'inherit'],
    // Buffers keep the capture byte-faithful: the string decode upstream
    // trims, and a capture lane must not eat leading/trailing whitespace.
    stdioString: false,
    throws: false,
  })
  const { code, stdout } = result
  return {
    code: typeof code === 'number' ? code : 1,
    stdout: stdout ? stdout.toString('utf8') : '',
  }
}

/**
 * Spawn a command and forward stdio (interactive). Resolves the exit code.
 * Use when the user needs to see and interact with the live output stream
 * (publish/approve prompts, upload progress). A signal-killed child resolves
 * `1`; a launch failure rejects.
 */
export async function runInherit(
  cmd: string,
  args: string[] | readonly string[],
  options?: RunOptions | undefined,
): Promise<number> {
  const { cwd, env } = { __proto__: null, ...options } as RunOptions
  const { code } = await spawn(cmd, args, {
    cwd,
    env,
    shell: isWin32(),
    stdio: 'inherit',
    throws: false,
  })
  return typeof code === 'number' ? code : 1
}

/**
 * Spawn a command, forward its output live, AND keep a copy.
 *
 * {@link runInherit} hands the child the parent's stdio, so the caller sees
 * the output but can never read it; {@link runCapture} reads stdout but
 * silences it. A failure handler often needs both halves — the operator
 * watches the stream in real time, and the code has to inspect what the tool
 * actually said before it offers a diagnosis. Both streams accumulate into
 * ONE buffer because a definitive error and its context can straddle them
 * (a CLI logging its warning two lines from its error, one per stream).
 * stdin stays inherited so an interactive prompt still reaches the user.
 */
export async function runInheritTee(
  cmd: string,
  args: string[] | readonly string[],
  options?: TeeRunOptions | undefined,
): Promise<TeedRun> {
  const { cwd, env, onStderr, onStdout } = {
    __proto__: null,
    ...options,
  } as TeeRunOptions
  const forwardStdout =
    onStdout ??
    ((chunk: Buffer) => {
      process.stdout.write(chunk)
    })
  const forwardStderr =
    onStderr ??
    ((chunk: Buffer) => {
      process.stderr.write(chunk)
    })
  const childPromise = spawn(cmd, args, {
    cwd,
    env,
    shell: isWin32(),
    // stdin inherited so prompts reach the user; both output streams piped so
    // they can be teed.
    stdio: ['inherit', 'pipe', 'pipe'],
    stdioString: false,
    throws: false,
  })
  let output = ''
  const { process: child } = childPromise
  child.stdout?.on('data', (chunk: Buffer) => {
    output += chunk.toString('utf8')
    forwardStdout(chunk)
  })
  child.stderr?.on('data', (chunk: Buffer) => {
    output += chunk.toString('utf8')
    forwardStderr(chunk)
  })
  const { code } = await childPromise
  return { code: typeof code === 'number' ? code : 1, output }
}

/**
 * Wait for stdio handles to finish flushing. When spawning multiple processes
 * with `stdio: 'inherit'`, child processes can exit while leaving stdio
 * handles with pending write callbacks; polling for drain prevents
 * intermittent hangs at process exit. Returns once no inherited stdio handle
 * reports pending writes, or after `timeoutMs`.
 */
export async function waitForStdioFlush(
  timeoutMs: number = 1000,
): Promise<void> {
  const startTime = Date.now()
  while (Date.now() - startTime < timeoutMs) {
    const handles = (
      process as unknown as {
        _getActiveHandles(): Array<{
          _isStdio?: boolean | undefined
          _writableState?: { pendingcb: number } | undefined
          constructor?: { name?: string | undefined } | undefined
        }>
      }
    )._getActiveHandles()
    const hasStdioWithPendingWrites = handles.some(handle => {
      if (handle?.constructor?.name === 'Socket' && handle._isStdio) {
        const writableState = handle._writableState
        return !!writableState && writableState.pendingcb > 0
      }
      return false
    })
    if (!hasStdioWithPendingWrites) {
      return
    }
    // The poll is inherently sequential — each iteration re-reads the live
    // handle set after a short sleep.
    await new Promise(resolve => {
      setTimeout(resolve, 10)
    })
  }
}
