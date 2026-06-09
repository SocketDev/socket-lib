// IMPORTANT: src/secrets/linux.ts imports `spawn` + `spawnSync` from
// `@socketsecurity/lib-stable/process/spawn/child` — NOT from
// `node:child_process`. A mock against `node:child_process` is a no-op:
// every call would pass through to the real `secret-tool` binary. On
// macOS that fails benignly (no secret-tool installed); on Linux it
// would write a real entry to the user's libsecret keyring. The mock
// below targets the actual import surface so the test runs hermetically;
// the afterAll() further down is a defense-in-depth cleanup that wipes
// any libsecret item the test placeholders might have created if a
// future refactor breaks the mock again.
import { EventEmitter } from 'node:events'
import { Readable, Writable } from 'node:stream'

import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest'

import type * as SpawnChild from '@socketsecurity/lib-stable/process/spawn/child'

const { mockSpawn, mockSpawnSync } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  mockSpawnSync: vi.fn(),
}))

vi.mock(import('@socketsecurity/lib-stable/process/spawn/child'), async () => {
  const actual = await vi.importActual<typeof SpawnChild>(
    '@socketsecurity/lib-stable/process/spawn/child',
  )
  return {
    ...actual,
    default: actual,
    spawn: mockSpawn,
    spawnSync: mockSpawnSync,
  }
})

// Unique, traceable placeholders. The shape `socket-lib-test:secrets/linux:*`
// is grep-able and tells you exactly which test file would have created a
// leaked entry. If you ever see one in `secret-tool search` (Linux) or
// `security dump-keychain` (macOS — should never happen, secret-tool isn't
// macOS), it came from this file — the afterAll() below was bypassed
// (probably because the mock regressed).
const TEST_SERVICE_BASE = 'socket-lib-test:secrets/linux'
const TEST_SERVICE_WRITE = `${TEST_SERVICE_BASE}:writeLinux-args`
const TEST_ACCOUNT = 'unit-test-account'
const TEST_VALUE = 'unit-test-value-do-not-trust'
const TEST_LABEL = 'socket-lib unit test (test/unit/secrets/linux.test.mts)'

const ALL_TEST_SERVICES: readonly string[] = [TEST_SERVICE_WRITE]

interface FakeChild extends EventEmitter {
  stdin: Writable
  stdout: Readable | null
  stderr: Readable | null
}

// Writable stdin helper. Pass nothing for a no-op sink (the default a
// FakeChild ships with); pass an array to capture each chunk as a string
// so a test can assert what bytes the source wrote to the child. One
// shape covers both call sites — the FakeChild default + the test that
// overrides stdin to capture writeLinux's secret payload.
function makeWritableStdin(captureInto?: string[]): Writable {
  return new Writable({
    write(chunk, _enc, cb) {
      if (captureInto) {
        captureInto.push(String(chunk))
      }
      cb()
    },
  })
}

// `@socketsecurity/lib-stable/process/spawn/child`'s `spawn()` returns
// `{ process: ChildProcess, ... }` (the lib wraps the raw child); src code
// does `const { process: cp } = spawn(...)`. Returns the wrapped shape so
// `mockSpawn.mockImplementationOnce(() => makeFakeChild({ ... }))` Just
// Works without per-call destructuring. Pass `stdinCapture: []` to swap
// the no-op stdin for a sink that records every chunk written to the
// child.
// The lib's `spawn()` returns `{ process: ChildProcess } & Promise<{ code,
// stdout, stderr }>` — awaitable AND carrying the raw child on `.process`. The
// secrets runners now `await` the spawn result (stdioString → string stdout/
// stderr) and read stdin via `.process.stdin`, so the fake must be a thenable
// too. A non-zero exit code REJECTS (the lib's contract), carrying the same
// `{ code, stdout, stderr }` on the error.
function makeFakeChild(opts: {
  stdout?: string | undefined
  stderr?: string | undefined
  exitCode?: number | null | undefined
  emitError?: Error | undefined
  stdinCapture?: string[] | undefined
}): { process: FakeChild } & Promise<{
  code: number | null
  stdout: string
  stderr: string
}> {
  const emitter = new EventEmitter() as FakeChild
  emitter.stdin = makeWritableStdin(opts.stdinCapture)
  emitter.stdout = Readable.from(opts.stdout ? [opts.stdout] : [])
  emitter.stderr = Readable.from(opts.stderr ? [opts.stderr] : [])
  const stdout = opts.stdout ?? ''
  const stderr = opts.stderr ?? ''
  const code = opts.exitCode ?? 0
  const settled = new Promise<{
    code: number | null
    stdout: string
    stderr: string
  }>((resolve, reject) => {
    // Resolve on next tick so callers can attach `.process.stdin` writes first.
    // Also emit the raw child's `error`/`close` events: some runners (deleteX)
    // still consume the event-style child via `.process.on('close')`, while
    // read/write await the Promise — the lib's shape supports both.
    queueMicrotask(() => {
      if (opts.emitError) {
        // Only emit the EventEmitter `error` if something listens — an
        // `error` event with no listener throws as an uncaught exception
        // (Node semantics). The await-style runners DON'T listen on
        // `.process.on('error')`; the event-style ones (deleteX) do.
        if (emitter.listenerCount('error') > 0) {
          emitter.emit('error', opts.emitError)
        }
        // A spawn error (e.g. ENOENT) carries a non-numeric `.code` (e.g.
        // "ENOENT") on the lib's rejection — the runner's catch maps a
        // non-numeric code to status -1.
        reject(Object.assign(opts.emitError, { stderr, stdout }))
        return
      }
      emitter.emit('close', code)
      // The lib rejects on a non-zero exit, carrying the result on the error.
      if (code !== 0) {
        reject(
          Object.assign(new Error(`exit ${code}`), { code, stderr, stdout }),
        )
        return
      }
      resolve({ code, stderr, stdout })
    })
  })
  // A non-zero rejection nobody awaits (the event-style delete path) must not
  // surface as an unhandled rejection.
  settled.catch(() => {})
  // Attach `.process` to the Promise so the awaitable AND `{ process }`
  // destructure both work, matching the lib's `{ process } & Promise` shape.
  return Object.assign(settled, { process: emitter }) as {
    process: FakeChild
  } & Promise<{ code: number | null; stdout: string; stderr: string }>
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

// Defense-in-depth: if a future refactor breaks the vi.mock above and
// reaches the real `secret-tool` binary, we still don't want libsecret
// turds. Spawns the REAL secret-tool here (NOT the mocked module — we go
// through node:child_process directly) to clear any leaked entries.
// Best-effort: silent on non-Linux, silent if the item doesn't exist.
afterAll(async () => {
  if (process.platform !== 'linux') {
    return
  }
  // Minimal shape for the real spawn used by the keychain cleanup below;
  // avoids a node:child_process type import (prefer-async-spawn-guard) and the
  // forbidden import() type annotation.
  const { spawn: realSpawn } = (await vi.importActual(
    'node:child_process',
  )) as { spawn: (...args: unknown[]) => { on: (...a: unknown[]) => void } }
  await Promise.all(
    ALL_TEST_SERVICES.map(
      svc =>
        new Promise<void>(resolve => {
          const child = realSpawn(
            'secret-tool',
            ['clear', 'service', svc, 'account', TEST_ACCOUNT],
            { stdio: 'ignore' },
          )
          child.on('close', () => resolve())
          child.on('error', () => resolve())
        }),
    ),
  )
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
    // `stdinCapture: writes` swaps the FakeChild's default no-op stdin
    // for a sink that records every chunk — so the assertion below can
    // check the source actually piped the secret value to secret-tool.
    const writes: string[] = []
    mockSpawn.mockImplementationOnce(() =>
      makeFakeChild({ exitCode: 0, stdinCapture: writes }),
    )
    const { writeLinux } = await loadFresh()
    // Traceable placeholders: service / account / value / label all carry
    // 'socket-lib unit test' lineage. The mock above intercepts before any
    // real `secret-tool` call; the afterAll() is defense-in-depth.
    await expect(
      writeLinux(TEST_SERVICE_WRITE, TEST_ACCOUNT, TEST_VALUE, TEST_LABEL),
    ).resolves.toBeUndefined()
    expect(writes.join('')).toBe(TEST_VALUE)
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
      (
        _bin: string,
        _args: readonly string[],
        opts: { input?: unknown | undefined },
      ) => {
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
