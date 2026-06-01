import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { mockSpawn, mockSpawnSync } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  mockSpawnSync: vi.fn(),
}))

vi.mock(import('node:child_process'), async () => {
  const actual =
    await vi.importActual<typeof import('node:child_process')>(
      'node:child_process',
    )
  return {
    ...actual,
    default: actual,
    spawn: mockSpawn,
    spawnSync: mockSpawnSync,
  }
})

interface FakeChild extends EventEmitter {
  stdout: Readable | null | undefined
  stderr: Readable | null | undefined
}

function makeFakeChild(opts: {
  stdout?: string | undefined
  stderr?: string | undefined
  exitCode?: number | null | undefined
  emitError?: Error | undefined
  noStreams?: boolean | undefined
}): FakeChild {
  const emitter = new EventEmitter() as FakeChild
  if (opts.noStreams) {
    emitter.stdout = undefined
    emitter.stderr = undefined
  } else {
    emitter.stdout = Readable.from(opts.stdout ? [opts.stdout] : [])
    emitter.stderr = Readable.from(opts.stderr ? [opts.stderr] : [])
  }
  const stdoutDone =
    !emitter.stdout || !opts.stdout
      ? Promise.resolve()
      : new Promise<void>(resolve => emitter.stdout!.on('end', () => resolve()))
  const stderrDone =
    !emitter.stderr || !opts.stderr
      ? Promise.resolve()
      : new Promise<void>(resolve => emitter.stderr!.on('end', () => resolve()))
  Promise.all([stdoutDone, stderrDone]).then(() => {
    if (opts.emitError) {
      emitter.emit('error', opts.emitError)
    }
    emitter.emit('close', opts.exitCode ?? 0)
  })
  return emitter
}

async function loadFresh() {
  const mod = await import('../../../src/secrets/macos')
  return mod
}

beforeEach(() => {
  vi.resetModules()
  mockSpawn.mockReset()
  mockSpawnSync.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe.sequential('secrets/macos — isMacOSBackendAvailable', () => {
  test('always returns true (security(1) ships with macOS)', async () => {
    const { isMacOSBackendAvailable } = await loadFresh()
    expect(isMacOSBackendAvailable()).toBe(true)
  })
})

describe.sequential('secrets/macos — readMacOS', () => {
  test('returns trimmed stdout when status === 0', async () => {
    mockSpawn.mockImplementationOnce(() =>
      makeFakeChild({ stdout: 'secret-value\n', exitCode: 0 }),
    )
    const { readMacOS } = await loadFresh()
    expect(await readMacOS('svc', 'acc')).toBe('secret-value')
  })

  test('returns undefined when status is non-zero (entry missing)', async () => {
    mockSpawn.mockImplementationOnce(() =>
      makeFakeChild({ exitCode: 44, stderr: 'not found' }),
    )
    const { readMacOS } = await loadFresh()
    expect(await readMacOS('svc', 'acc')).toBeUndefined()
  })

  test('returns undefined when stdout is empty after trim', async () => {
    mockSpawn.mockImplementationOnce(() =>
      makeFakeChild({ stdout: '   \n', exitCode: 0 }),
    )
    const { readMacOS } = await loadFresh()
    expect(await readMacOS('svc', 'acc')).toBeUndefined()
  })

  test('returns undefined when the child emits "error" (status -1)', async () => {
    mockSpawn.mockImplementationOnce(() =>
      makeFakeChild({
        emitError: new Error('ENOENT'),
        exitCode: undefined,
      }),
    )
    const { readMacOS } = await loadFresh()
    expect(await readMacOS('svc', 'acc')).toBeUndefined()
  })
})

describe.sequential('secrets/macos — readMacOSSync', () => {
  test('returns trimmed stdout when status === 0', async () => {
    mockSpawnSync.mockReturnValueOnce({ status: 0, stdout: 'sync-val\n' })
    const { readMacOSSync } = await loadFresh()
    expect(readMacOSSync('svc', 'acc')).toBe('sync-val')
  })

  test('returns undefined when status non-zero', async () => {
    mockSpawnSync.mockReturnValueOnce({ status: 44, stdout: '' })
    const { readMacOSSync } = await loadFresh()
    expect(readMacOSSync('svc', 'acc')).toBeUndefined()
  })

  test('returns undefined on empty trimmed output', async () => {
    mockSpawnSync.mockReturnValueOnce({ status: 0, stdout: '   ' })
    const { readMacOSSync } = await loadFresh()
    expect(readMacOSSync('svc', 'acc')).toBeUndefined()
  })
})

describe.sequential('secrets/macos — writeMacOS', () => {
  test('succeeds silently on status 0', async () => {
    mockSpawn.mockImplementationOnce(() => makeFakeChild({ exitCode: 0 }))
    const { writeMacOS } = await loadFresh()
    await expect(writeMacOS('svc', 'acc', 'v', 'lbl')).resolves.toBeUndefined()
  })

  test('passes ACL flags (-U -A -T "" -D label -l label) and -w <value>', async () => {
    let capturedArgs: readonly string[] = []
    mockSpawn.mockImplementationOnce(
      (_bin: string, args: readonly string[]) => {
        capturedArgs = args
        return makeFakeChild({ exitCode: 0 })
      },
    )
    const { writeMacOS } = await loadFresh()
    await writeMacOS('my-svc', 'my-acc', 'my-val', 'My Label')
    expect(capturedArgs).toContain('add-generic-password')
    expect(capturedArgs).toContain('-U')
    expect(capturedArgs).toContain('-A')
    // -T '' allows any application read
    const tIdx = capturedArgs.indexOf('-T')
    expect(capturedArgs[tIdx + 1]).toBe('')
    expect(capturedArgs).toContain('-D')
    expect(capturedArgs).toContain('-l')
    expect(capturedArgs).toContain('My Label')
    expect(capturedArgs).toContain('my-val')
  })

  test('throws with stderr-trimmed detail on non-zero status', async () => {
    mockSpawn.mockImplementationOnce(() =>
      makeFakeChild({ exitCode: 1, stderr: '  permission denied\n' }),
    )
    const { writeMacOS } = await loadFresh()
    await expect(writeMacOS('svc', 'acc', 'v', 'lbl')).rejects.toThrow(
      /permission denied/,
    )
  })

  test('throws when child emits "error" (status === -1 maps to throw)', async () => {
    mockSpawn.mockImplementationOnce(() =>
      makeFakeChild({
        emitError: new Error('spawn EACCES'),
        exitCode: undefined,
      }),
    )
    const { writeMacOS } = await loadFresh()
    await expect(writeMacOS('svc', 'acc', 'v', 'lbl')).rejects.toThrow(
      /add-generic-password failed/,
    )
  })
})

describe.sequential('secrets/macos — writeMacOSSync', () => {
  test('succeeds silently on status 0', async () => {
    mockSpawnSync.mockReturnValueOnce({ status: 0, stderr: '' })
    const { writeMacOSSync } = await loadFresh()
    expect(() => writeMacOSSync('svc', 'acc', 'v', 'lbl')).not.toThrow()
  })

  test('throws with stderr message on non-zero status', async () => {
    mockSpawnSync.mockReturnValueOnce({ status: 1, stderr: 'sync-err' })
    const { writeMacOSSync } = await loadFresh()
    expect(() => writeMacOSSync('svc', 'acc', 'v', 'lbl')).toThrow(/sync-err/)
  })
})

describe.sequential('secrets/macos — deleteMacOS', () => {
  test('returns "removed" on status 0', async () => {
    mockSpawn.mockImplementationOnce(() => makeFakeChild({ exitCode: 0 }))
    const { deleteMacOS } = await loadFresh()
    expect(await deleteMacOS('svc', 'acc')).toBe('removed')
  })

  test('returns "absent" on status 44 (item not found)', async () => {
    mockSpawn.mockImplementationOnce(() => makeFakeChild({ exitCode: 44 }))
    const { deleteMacOS } = await loadFresh()
    expect(await deleteMacOS('svc', 'acc')).toBe('absent')
  })

  test('uses stdio: ignore so no streams are read', async () => {
    let capturedOpts: { stdio?: unknown | undefined } | undefined
    mockSpawn.mockImplementationOnce(
      (
        _bin: string,
        _args: readonly string[],
        opts: { stdio?: unknown | undefined },
      ) => {
        capturedOpts = opts
        return makeFakeChild({ exitCode: 0, noStreams: true })
      },
    )
    const { deleteMacOS } = await loadFresh()
    await deleteMacOS('svc', 'acc')
    expect(capturedOpts?.stdio).toBe('ignore')
  })
})

describe.sequential('secrets/macos — deleteMacOSSync', () => {
  test('returns "removed" on status 0', async () => {
    mockSpawnSync.mockReturnValueOnce({ status: 0 })
    const { deleteMacOSSync } = await loadFresh()
    expect(deleteMacOSSync('svc', 'acc')).toBe('removed')
  })

  test('returns "absent" on non-zero status', async () => {
    mockSpawnSync.mockReturnValueOnce({ status: 44 })
    const { deleteMacOSSync } = await loadFresh()
    expect(deleteMacOSSync('svc', 'acc')).toBe('absent')
  })
})

describe.sequential('secrets/macos — runAsync', () => {
  test('returns aggregated stdout + stderr + close-event status', async () => {
    mockSpawn.mockImplementationOnce(() =>
      makeFakeChild({ stdout: 'OUT', stderr: 'ERR', exitCode: 7 }),
    )
    const { runAsync } = await loadFresh()
    expect(await runAsync(['version'])).toEqual({
      status: 7,
      stdout: 'OUT',
      stderr: 'ERR',
    })
  })

  test('handles missing stdout/stderr (stdio:"ignore") without throwing', async () => {
    mockSpawn.mockImplementationOnce(() =>
      makeFakeChild({ noStreams: true, exitCode: 0 }),
    )
    const { runAsync } = await loadFresh()
    expect(await runAsync(['x'], { stdio: 'ignore' })).toEqual({
      status: 0,
      stdout: '',
      stderr: '',
    })
  })
})
