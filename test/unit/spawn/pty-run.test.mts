/**
 * @file Unit tests for the `ptyRun` spawn body with the child process scripted.
 *   The sibling `pty.test.mts` runs the real `script` binary, but skips that
 *   case under coverage because allocating a genuine pseudo-terminal inside the
 *   parallel harness is unreliable. The accumulation, streaming and exit-code
 *   contract does not need a real PTY to be checked, so here the child is a
 *   scripted stand-in and the assertions cover what the runner promises: every
 *   chunk reaches the callback, the accumulated text is complete, a non-zero
 *   exit is a result rather than a throw, and a spawn error rejects.
 */

import { EventEmitter } from 'node:events'
import process from 'node:process'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { getNodeChildProcess } from '../../../src/node/child-process.mjs'

const spawnMock = vi.fn()

// The runner only ever reaches for `spawn`, so the stand-in supplies that one
// member and is widened to the module's type rather than stubbing 30 builtins.
type NodeChildProcessModule = ReturnType<typeof getNodeChildProcess>

vi.mock(import('../../../src/node/child-process.mjs'), () => ({
  getNodeChildProcess: () =>
    ({ spawn: spawnMock }) as unknown as NodeChildProcessModule,
}))

async function loadPty() {
  return await import('../../../src/process/spawn/pty.mjs')
}

// A child killed by a signal closes with a null code, not undefined.
const SIGNAL_CLOSE_CODE: number | null = null

/**
 * A stand-in for the spawned `script` child: two readable-ish streams plus the
 * `error` / `close` events the runner listens for.
 */
class FakeChild extends EventEmitter {
  readonly stderr = new EventEmitter()
  readonly stdout = new EventEmitter()
}

/**
 * Register a child that replays `script`'s behaviour on the next tick: emit
 * the given stdout/stderr chunks, then close with `code`.
 */
function scriptChild(behaviour: {
  code?: number | null | undefined
  spawnError?: Error | undefined
  stderr?: string[] | undefined
  stdout?: string[] | undefined
}): FakeChild {
  const child = new FakeChild()
  spawnMock.mockImplementation(() => {
    queueMicrotask(() => {
      for (const chunk of behaviour.stdout ?? []) {
        child.stdout.emit('data', Buffer.from(chunk, 'utf8'))
      }
      for (const chunk of behaviour.stderr ?? []) {
        child.stderr.emit('data', Buffer.from(chunk, 'utf8'))
      }
      if (behaviour.spawnError) {
        child.emit('error', behaviour.spawnError)
        return
      }
      child.emit('close', 'code' in behaviour ? behaviour.code : 0)
    })
    return child
  })
  return child
}

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('what ptyRun spawns', () => {
  it('spawns the platform invocation, never the command directly', async () => {
    scriptChild({})
    await (
      await loadPty()
    ).ptyRun('node', ['--version'], { platform: 'darwin' })
    expect(spawnMock.mock.calls[0]?.[0]).toBe('script')
    expect(spawnMock.mock.calls[0]?.[1]).toEqual([
      '-q',
      '/dev/null',
      'node',
      '--version',
    ])
  })

  it('inherits stdin and pipes both output streams', async () => {
    // stdin must be inherited or an interactive prompt has nothing to read;
    // the outputs must be pipes or there is nothing to accumulate.
    scriptChild({})
    await (await loadPty()).ptyRun('node', [], { platform: 'darwin' })
    expect(spawnMock.mock.calls[0]?.[2]?.stdio).toEqual([
      'inherit',
      'pipe',
      'pipe',
    ])
  })

  it('forwards cwd, env and the abort signal to the child', async () => {
    scriptChild({})
    const controller = new AbortController()
    await (
      await loadPty()
    ).ptyRun('node', [], {
      cwd: '/repo',
      env: { NO_COLOR: '1' },
      platform: 'darwin',
      signal: controller.signal,
    })
    expect(spawnMock.mock.calls[0]?.[2]).toMatchObject({
      cwd: '/repo',
      env: { NO_COLOR: '1' },
      signal: controller.signal,
    })
  })
})

describe('what ptyRun resolves', () => {
  it('accumulates every stdout chunk in order', async () => {
    scriptChild({ stdout: ['v26.', '5.0\n'] })
    const result = await (
      await loadPty()
    ).ptyRun('node', [], { platform: 'darwin' })
    expect(result.stdout).toBe('v26.5.0\n')
    expect(result.stderr).toBe('')
  })

  it('accumulates stderr separately from stdout', async () => {
    scriptChild({ stderr: ['warn\n'], stdout: ['out\n'] })
    const result = await (
      await loadPty()
    ).ptyRun('node', [], { platform: 'darwin' })
    expect(result).toEqual({ exitCode: 0, stderr: 'warn\n', stdout: 'out\n' })
  })

  it('streams each chunk to the callbacks as it arrives', async () => {
    const seenOut: string[] = []
    const seenErr: string[] = []
    scriptChild({ stderr: ['e1'], stdout: ['a', 'b'] })
    await (
      await loadPty()
    ).ptyRun('node', [], {
      onStderr: chunk => seenErr.push(chunk),
      onStdout: chunk => seenOut.push(chunk),
      platform: 'darwin',
    })
    expect(seenOut).toEqual(['a', 'b'])
    expect(seenErr).toEqual(['e1'])
  })

  it('returns a non-zero exit as a result, not a throw', async () => {
    // Callers branch on exitCode; throwing would make every failed command
    // an exception to catch.
    scriptChild({ code: 3, stdout: ['nope\n'] })
    const result = await (
      await loadPty()
    ).ptyRun('node', [], { platform: 'darwin' })
    expect(result.exitCode).toBe(3)
    expect(result.stdout).toBe('nope\n')
  })

  it('reports a null exit code as 1', async () => {
    // A child killed by a signal closes with a null code, which is a failure.
    scriptChild({ code: SIGNAL_CLOSE_CODE })
    expect(
      (await (await loadPty()).ptyRun('node', [], { platform: 'darwin' }))
        .exitCode,
    ).toBe(1)
  })

  it('rejects when the child fails to spawn', async () => {
    scriptChild({ spawnError: new Error('ENOENT script') })
    await expect(
      (await loadPty()).ptyRun('node', [], { platform: 'darwin' }),
    ).rejects.toThrow('ENOENT script')
  })
})

describe('ptyRunPumped', () => {
  it('writes each chunk on to the parent streams', async () => {
    const outSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true)
    const errSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true)
    scriptChild({ stderr: ['warn\n'], stdout: ['out\n'] })
    const result = await (
      await loadPty()
    ).ptyRunPumped('node', [], { platform: 'darwin' })
    expect(outSpy).toHaveBeenCalledWith('out\n')
    expect(errSpy).toHaveBeenCalledWith('warn\n')
    expect(result.stdout).toBe('out\n')
  })

  it('still hands every chunk to the caller callbacks', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const seenOut: string[] = []
    const seenErr: string[] = []
    scriptChild({ stderr: ['warn\n'], stdout: ['out\n'] })
    await (
      await loadPty()
    ).ptyRunPumped('node', [], {
      onStderr: chunk => seenErr.push(chunk),
      onStdout: chunk => seenOut.push(chunk),
      platform: 'darwin',
    })
    expect(seenOut).toEqual(['out\n'])
    expect(seenErr).toEqual(['warn\n'])
  })

  it('works without callbacks at all', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    scriptChild({ stdout: ['out\n'] })
    expect(
      (await (await loadPty()).ptyRunPumped('node', [], { platform: 'darwin' }))
        .exitCode,
    ).toBe(0)
  })

  it('uses the linux -c form when told the platform is linux', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    scriptChild({})
    await (
      await loadPty()
    ).ptyRunPumped('echo', ["it's"], { platform: 'linux' })
    expect(spawnMock.mock.calls[0]?.[1]).toEqual([
      '-q',
      '-c',
      "'echo' 'it'\\''s'",
      '/dev/null',
    ])
  })
})
