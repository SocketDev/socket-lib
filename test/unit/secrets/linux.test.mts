import { EventEmitter } from 'node:events'
import { Readable, Writable } from 'node:stream'

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { mockSpawn, mockSpawnSync } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  mockSpawnSync: vi.fn(),
}))

vi.mock('node:child_process', async () => {
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
  stdin: Writable
  stdout: Readable | null
  stderr: Readable | null
}

function makeFakeChild(opts: {
  stdout?: string
  stderr?: string
  exitCode?: number | null | undefined
  emitError?: Error
}): FakeChild {
  const emitter = new EventEmitter() as FakeChild
  emitter.stdin = new Writable({
    write(_c, _e, cb) {
      cb()
    },
  })
  emitter.stdout = Readable.from(opts.stdout ? [opts.stdout] : [])
  emitter.stderr = Readable.from(opts.stderr ? [opts.stderr] : [])
  const stdoutDone = !opts.stdout
    ? Promise.resolve()
    : new Promise<void>(r => emitter.stdout!.on('end', () => r()))
  const stderrDone = !opts.stderr
    ? Promise.resolve()
    : new Promise<void>(r => emitter.stderr!.on('end', () => r()))
  Promise.all([stdoutDone, stderrDone]).then(() => {
    if (opts.emitError) {
      emitter.emit('error', opts.emitError)
    }
    emitter.emit('close', opts.exitCode ?? 0)
  })
  return emitter
}

async function loadFresh() {
  const mod = await import('../../../src/secrets/linux')
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

describe.sequential('secrets/linux — isLinuxBackendAvailable', () => {
  test('returns true when secret-tool --version exits 0', async () => {
    mockSpawnSync.mockReturnValueOnce({ status: 0 })
    const { isLinuxBackendAvailable } = await loadFresh()
    expect(isLinuxBackendAvailable()).toBe(true)
  })

  test('returns false when secret-tool is missing (status != 0)', async () => {
    mockSpawnSync.mockReturnValueOnce({ status: undefined })
    const { isLinuxBackendAvailable } = await loadFresh()
    expect(isLinuxBackendAvailable()).toBe(false)
  })
})

describe.sequential('secrets/linux — readLinux', () => {
  test('returns trimmed stdout on status 0', async () => {
    mockSpawn.mockImplementationOnce(() =>
      makeFakeChild({ stdout: 'linux-secret\n', exitCode: 0 }),
    )
    const { readLinux } = await loadFresh()
    expect(await readLinux('svc', 'acc')).toBe('linux-secret')
  })

  test('returns undefined on non-zero status', async () => {
    mockSpawn.mockImplementationOnce(() => makeFakeChild({ exitCode: 1 }))
    const { readLinux } = await loadFresh()
    expect(await readLinux('svc', 'acc')).toBeUndefined()
  })

  test('returns undefined on whitespace-only stdout', async () => {
    mockSpawn.mockImplementationOnce(() =>
      makeFakeChild({ stdout: '   \n', exitCode: 0 }),
    )
    const { readLinux } = await loadFresh()
    expect(await readLinux('svc', 'acc')).toBeUndefined()
  })

  test('returns undefined when child errors (secret-tool not installed)', async () => {
    mockSpawn.mockImplementationOnce(() =>
      makeFakeChild({
        emitError: new Error('ENOENT'),
        exitCode: undefined,
      }),
    )
    const { readLinux } = await loadFresh()
    expect(await readLinux('svc', 'acc')).toBeUndefined()
  })
})

describe.sequential('secrets/linux — readLinuxSync', () => {
  test('returns trimmed stdout on status 0', async () => {
    mockSpawnSync.mockReturnValueOnce({ status: 0, stdout: 'sync-secret\n' })
    const { readLinuxSync } = await loadFresh()
    expect(readLinuxSync('svc', 'acc')).toBe('sync-secret')
  })

  test('returns undefined on non-zero status', async () => {
    mockSpawnSync.mockReturnValueOnce({ status: 1, stdout: '' })
    const { readLinuxSync } = await loadFresh()
    expect(readLinuxSync('svc', 'acc')).toBeUndefined()
  })

  test('returns undefined on whitespace-only output', async () => {
    mockSpawnSync.mockReturnValueOnce({ status: 0, stdout: '   ' })
    const { readLinuxSync } = await loadFresh()
    expect(readLinuxSync('svc', 'acc')).toBeUndefined()
  })
})

describe.sequential('secrets/linux — writeLinux', () => {
  test('resolves on status 0', async () => {
    const stdinWrites: string[] = []
    mockSpawn.mockImplementationOnce(() => {
      const c = makeFakeChild({ exitCode: 0 })
      c.stdin = new Writable({
        write(chunk, _e, cb) {
          stdinWrites.push(String(chunk))
          cb()
        },
      })
      return c
    })
    const { writeLinux } = await loadFresh()
    await expect(
      writeLinux('svc', 'acc', 'secret-val', 'My Label'),
    ).resolves.toBeUndefined()
    expect(stdinWrites.join('')).toBe('secret-val')
  })

  test('passes --label=<label> and service/user attributes', async () => {
    let capturedArgs: readonly string[] = []
    mockSpawn.mockImplementationOnce(
      (_bin: string, args: readonly string[]) => {
        capturedArgs = args
        return makeFakeChild({ exitCode: 0 })
      },
    )
    const { writeLinux } = await loadFresh()
    await writeLinux('svc', 'acc', 'v', 'Tag Line')
    expect(capturedArgs).toContain('store')
    expect(capturedArgs).toContain('--label=Tag Line')
    expect(capturedArgs).toContain('service')
    expect(capturedArgs).toContain('svc')
    expect(capturedArgs).toContain('user')
    expect(capturedArgs).toContain('acc')
  })

  test('rejects with libsecret install hint when child errors', async () => {
    mockSpawn.mockImplementationOnce(() =>
      makeFakeChild({
        emitError: new Error('ENOENT'),
        exitCode: undefined,
      }),
    )
    const { writeLinux } = await loadFresh()
    await expect(writeLinux('svc', 'acc', 'v', 'lbl')).rejects.toThrow(
      /libsecret-tools/,
    )
  })

  test('rejects with stderr + libsecret install hint on non-zero status', async () => {
    mockSpawn.mockImplementationOnce(() =>
      makeFakeChild({ exitCode: 1, stderr: 'no provider' }),
    )
    const { writeLinux } = await loadFresh()
    await expect(writeLinux('svc', 'acc', 'v', 'lbl')).rejects.toThrow(
      /no provider.*libsecret-tools/s,
    )
  })
})

describe.sequential('secrets/linux — writeLinuxSync', () => {
  test('returns silently on status 0', async () => {
    mockSpawnSync.mockReturnValueOnce({ status: 0, stderr: '' })
    const { writeLinuxSync } = await loadFresh()
    expect(() => writeLinuxSync('svc', 'acc', 'v', 'lbl')).not.toThrow()
  })

  test('throws with stderr + libsecret hint on non-zero status', async () => {
    mockSpawnSync.mockReturnValueOnce({ status: 1, stderr: 'sync-fail' })
    const { writeLinuxSync } = await loadFresh()
    expect(() => writeLinuxSync('svc', 'acc', 'v', 'lbl')).toThrow(
      /sync-fail.*libsecret/s,
    )
  })

  test('passes input: value so password never reaches argv', async () => {
    let capturedInput: unknown
    mockSpawnSync.mockImplementationOnce(
      (_bin: string, _args: readonly string[], opts: { input?: unknown }) => {
        capturedInput = opts.input
        return { status: 0, stderr: '' }
      },
    )
    const { writeLinuxSync } = await loadFresh()
    writeLinuxSync('svc', 'acc', 'secret', 'lbl')
    expect(capturedInput).toBe('secret')
  })
})

describe.sequential('secrets/linux — deleteLinux', () => {
  test('returns "removed" on status 0', async () => {
    mockSpawn.mockImplementationOnce(() => makeFakeChild({ exitCode: 0 }))
    const { deleteLinux } = await loadFresh()
    expect(await deleteLinux('svc', 'acc')).toBe('removed')
  })

  test('returns "absent" on non-zero status (entry already gone)', async () => {
    mockSpawn.mockImplementationOnce(() => makeFakeChild({ exitCode: 1 }))
    const { deleteLinux } = await loadFresh()
    expect(await deleteLinux('svc', 'acc')).toBe('absent')
  })

  test('returns "absent" when child errors (secret-tool not installed)', async () => {
    mockSpawn.mockImplementationOnce(() =>
      makeFakeChild({
        emitError: new Error('ENOENT'),
        exitCode: undefined,
      }),
    )
    const { deleteLinux } = await loadFresh()
    expect(await deleteLinux('svc', 'acc')).toBe('absent')
  })
})

describe.sequential('secrets/linux — deleteLinuxSync', () => {
  test('returns "removed" on status 0', async () => {
    mockSpawnSync.mockReturnValueOnce({ status: 0 })
    const { deleteLinuxSync } = await loadFresh()
    expect(deleteLinuxSync('svc', 'acc')).toBe('removed')
  })

  test('returns "absent" on non-zero status', async () => {
    mockSpawnSync.mockReturnValueOnce({ status: 1 })
    const { deleteLinuxSync } = await loadFresh()
    expect(deleteLinuxSync('svc', 'acc')).toBe('absent')
  })
})
