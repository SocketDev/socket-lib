// IMPORTANT: src/secrets/macos.ts imports `spawn` + `spawnSync` from
// `@socketsecurity/lib-stable/process/spawn/child` — NOT from `node:child_process`.
// A mock against `node:child_process` is a no-op here: every call would pass
// through to the real `security(1)` binary and write a real entry to the
// user's login keychain. The mock below targets the actual import surface so
// the test runs hermetically; the afterAll() further down is a defense-in-
// depth cleanup that wipes any keychain item the test placeholders might
// have created if a future refactor breaks the mock again.
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'

import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest'

const { mockSpawn, mockSpawnSync } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  mockSpawnSync: vi.fn(),
}))

vi.mock('@socketsecurity/lib-stable/process/spawn/child', async () => {
  const actual = await vi.importActual<
    typeof import('@socketsecurity/lib-stable/process/spawn/child')
  >('@socketsecurity/lib-stable/process/spawn/child')
  return {
    ...actual,
    default: actual,
    spawn: mockSpawn,
    spawnSync: mockSpawnSync,
  }
})

// Unique, traceable placeholders. The shape `socket-lib-test:secrets/macos:*`
// is grep-able and tells you exactly which test file would have created a
// leaked entry. If you ever see one in `security dump-keychain`, it came from
// this file — the afterAll() below was bypassed (probably because the mock
// regressed and the test was talking to the real keychain).
const TEST_SERVICE_BASE = 'socket-lib-test:secrets/macos'
const TEST_SERVICE_WRITE = `${TEST_SERVICE_BASE}:writeMacOS-args`
const TEST_ACCOUNT = 'unit-test-account'
const TEST_VALUE = 'unit-test-value-do-not-trust'
const TEST_LABEL = 'socket-lib unit test (test/unit/secrets/macos.test.mts)'

// All services this file might have written to. Used by the afterAll()
// cleanup; add any new TEST_SERVICE_* constant here.
const ALL_TEST_SERVICES: readonly string[] = [TEST_SERVICE_WRITE]

interface FakeChild extends EventEmitter {
  stdout: Readable | null | undefined
  stderr: Readable | null | undefined
}

// `@socketsecurity/lib-stable/process/spawn/child`'s `spawn()` returns
// `{ process: ChildProcess, ... }` (the lib wraps the raw child); src code
// does `const { process: cp } = spawn(...)`. The helper here returns the
// wrapped shape so call sites can stay terse — `mockSpawn.mockImplementationOnce(
// () => makeFakeChild({ ... }))` Just Works without per-call destructuring.
// On a regression where lib-stable's spawn wrapper grows new fields, this
// helper is the single edit point.
function makeFakeChild(opts: {
  stdout?: string | undefined
  stderr?: string | undefined
  exitCode?: number | null | undefined
  emitError?: Error | undefined
  noStreams?: boolean | undefined
}): { process: FakeChild } {
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
  return { process: emitter }
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

// Defense-in-depth: if a future refactor breaks the vi.mock above and the
// test reaches the real `security(1)` binary, we still don't want to leave
// turds in the user's login keychain. Spawn the REAL security CLI here
// (NOT the mocked module — we go through node:child_process directly) to
// delete any item this file might have created. Best-effort: silent on
// non-macOS, silent if the item doesn't exist (exit 44).
afterAll(async () => {
  if (process.platform !== 'darwin') {
    return
  }
  const { spawn: realSpawn } = await vi.importActual<
    typeof import('node:child_process')
  >('node:child_process')
  await Promise.all(
    ALL_TEST_SERVICES.map(svc =>
      new Promise<void>(resolve => {
        const child = realSpawn(
          '/usr/bin/security',
          ['delete-generic-password', '-s', svc, '-a', TEST_ACCOUNT],
          { stdio: 'ignore' },
        )
        child.on('close', () => resolve())
        child.on('error', () => resolve())
      }),
    ),
  )
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
    // Traceable placeholders: service / account / value / label all carry
    // 'socket-lib unit test' lineage so an item that ever leaks to the real
    // keychain points back at THIS test file unambiguously. The mock above
    // intercepts before any real `security` call; the afterAll() at the top
    // of this file is a defense-in-depth cleanup in case the mock regresses.
    await writeMacOS(
      TEST_SERVICE_WRITE,
      TEST_ACCOUNT,
      TEST_VALUE,
      TEST_LABEL,
    )
    expect(capturedArgs).toContain('add-generic-password')
    expect(capturedArgs).toContain('-U')
    expect(capturedArgs).toContain('-A')
    // -T '' allows any application read
    const tIdx = capturedArgs.indexOf('-T')
    expect(capturedArgs[tIdx + 1]).toBe('')
    expect(capturedArgs).toContain('-D')
    expect(capturedArgs).toContain('-l')
    expect(capturedArgs).toContain(TEST_LABEL)
    expect(capturedArgs).toContain(TEST_VALUE)
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
