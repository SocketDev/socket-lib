import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable, Writable } from 'node:stream'

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
  stdin: Writable
  stdout: Readable
  stderr: Readable
}

function makeFakeChild(opts: {
  stdout?: string | undefined
  stderr?: string | undefined
  exitCode?: number | null | undefined
  emitError?: Error | undefined
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
    : new Promise<void>(r => emitter.stdout.on('end', () => r()))
  const stderrDone = !opts.stderr
    ? Promise.resolve()
    : new Promise<void>(r => emitter.stderr.on('end', () => r()))
  Promise.all([stdoutDone, stderrDone]).then(() => {
    if (opts.emitError) {
      emitter.emit('error', opts.emitError)
    }
    emitter.emit('close', opts.exitCode ?? 0)
  })
  return emitter
}

let tmpRoot: string
let origAppData: string | undefined

async function loadFresh() {
  const mod = await import('../../../src/secrets/windows')
  return mod
}

beforeEach(() => {
  tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'secrets-windows-test-'))
  origAppData = process.env['APPDATA']
  process.env['APPDATA'] = tmpRoot
  vi.resetModules()
  mockSpawn.mockReset()
  mockSpawnSync.mockReset()
})

afterEach(() => {
  rmSync(tmpRoot, { force: true, recursive: true })
  if (origAppData === undefined) {
    delete process.env['APPDATA']
  } else {
    process.env['APPDATA'] = origAppData
  }
  vi.clearAllMocks()
})

describe.sequential('secrets/windows — buildTarget', () => {
  test('joins service + account with a colon', async () => {
    const { buildTarget } = await loadFresh()
    expect(buildTarget('svc', 'acc')).toBe('svc:acc')
  })

  test('handles empty fields literally (no canonicalization)', async () => {
    const { buildTarget } = await loadFresh()
    expect(buildTarget('a', '')).toBe('a:')
    expect(buildTarget('', 'b')).toBe(':b')
  })
})

describe.sequential('secrets/windows — quotePs', () => {
  test('wraps a plain string in single quotes', async () => {
    const { quotePs } = await loadFresh()
    expect(quotePs('hello')).toBe(`'hello'`)
  })

  test('doubles embedded single quotes (PowerShell escaping)', async () => {
    const { quotePs } = await loadFresh()
    expect(quotePs(`it's`)).toBe(`'it''s'`)
  })

  test('handles empty string', async () => {
    const { quotePs } = await loadFresh()
    expect(quotePs('')).toBe(`''`)
  })
})

describe.sequential('secrets/windows — validateKeychainComponent', () => {
  test('accepts a plain identifier', async () => {
    const { validateKeychainComponent } = await loadFresh()
    expect(() =>
      validateKeychainComponent('socket-cli', 'service'),
    ).not.toThrow()
  })

  test('rejects forward slashes', async () => {
    const { validateKeychainComponent } = await loadFresh()
    expect(() => validateKeychainComponent('a/b', 'service')).toThrow(
      /path-traversal/,
    )
  })

  test('rejects backslashes', async () => {
    const { validateKeychainComponent } = await loadFresh()
    expect(() => validateKeychainComponent('a\\b', 'service')).toThrow(
      /path-traversal/,
    )
  })

  test('rejects ".." anywhere in the value', async () => {
    const { validateKeychainComponent } = await loadFresh()
    expect(() => validateKeychainComponent('..', 'service')).toThrow()
    expect(() => validateKeychainComponent('a..b', 'service')).toThrow()
  })

  test('rejects NUL byte', async () => {
    const { validateKeychainComponent } = await loadFresh()
    expect(() => validateKeychainComponent('a\0b', 'service')).toThrow()
  })

  test('rejects empty string + "."', async () => {
    const { validateKeychainComponent } = await loadFresh()
    expect(() => validateKeychainComponent('', 'service')).toThrow()
    expect(() => validateKeychainComponent('.', 'service')).toThrow()
  })
})

describe.sequential('secrets/windows — getDpapiFilePath', () => {
  test('joins APPDATA / service / account.enc', async () => {
    const { getDpapiFilePath } = await loadFresh()
    expect(getDpapiFilePath('socket-cli', 'SOCKET_API_TOKEN')).toBe(
      path.join(tmpRoot, 'socket-cli', 'SOCKET_API_KEY.enc'),
    )
  })

  test('falls back to homedir/AppData/Roaming when APPDATA is unset', async () => {
    delete process.env['APPDATA']
    const { getDpapiFilePath } = await loadFresh()
    const p = getDpapiFilePath('svc', 'acc')
    expect(p).toMatch(/AppData[\\/]Roaming[\\/]svc[\\/]acc\.enc$/)
  })

  test('rejects service with path-traversal characters', async () => {
    const { getDpapiFilePath } = await loadFresh()
    expect(() => getDpapiFilePath('../evil', 'acc')).toThrow(/path-traversal/)
  })

  test('rejects account with path-traversal characters', async () => {
    const { getDpapiFilePath } = await loadFresh()
    expect(() => getDpapiFilePath('svc', 'a/b')).toThrow(/path-traversal/)
  })
})

describe.sequential('secrets/windows — isWindowsBackendAvailable', () => {
  test('returns true when powershell exit 0', async () => {
    mockSpawnSync.mockReturnValueOnce({ status: 0 })
    const { isWindowsBackendAvailable } = await loadFresh()
    expect(isWindowsBackendAvailable()).toBe(true)
  })

  test('returns false when powershell is missing', async () => {
    mockSpawnSync.mockReturnValueOnce({ status: undefined })
    const { isWindowsBackendAvailable } = await loadFresh()
    expect(isWindowsBackendAvailable()).toBe(false)
  })
})

describe.sequential('secrets/windows — runPsAsync', () => {
  test('returns aggregated stdout + stderr + status', async () => {
    mockSpawn.mockImplementationOnce(() =>
      makeFakeChild({ stdout: 'OUT', stderr: 'ERR', exitCode: 7 }),
    )
    const { runPsAsync } = await loadFresh()
    expect(await runPsAsync('exit 7')).toEqual({
      status: 7,
      stdout: 'OUT',
      stderr: 'ERR',
    })
  })

  test('writes input to stdin when provided', async () => {
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
    const { runPsAsync } = await loadFresh()
    await runPsAsync('read input', 'piped-token')
    expect(stdinWrites.join('')).toBe('piped-token')
  })

  test('returns status: -1 when child emits error', async () => {
    mockSpawn.mockImplementationOnce(() =>
      makeFakeChild({
        emitError: new Error('ENOENT'),
        exitCode: undefined,
      }),
    )
    const { runPsAsync } = await loadFresh()
    const result = await runPsAsync('script')
    expect(result.status).toBe(-1)
  })
})

describe.sequential('secrets/windows — runPsSync', () => {
  test('returns stdout/stderr/status from spawnSync', async () => {
    mockSpawnSync.mockReturnValueOnce({
      status: 3,
      stdout: 'sout',
      stderr: 'serr',
    })
    const { runPsSync } = await loadFresh()
    expect(runPsSync('script')).toEqual({
      status: 3,
      stdout: 'sout',
      stderr: 'serr',
    })
  })

  test('passes input arg through to spawnSync', async () => {
    let capturedInput: unknown
    mockSpawnSync.mockImplementationOnce(
      (
        _bin: string,
        _args: readonly string[],
        opts: { input?: unknown | undefined },
      ) => {
        capturedInput = opts.input
        return { status: 0, stdout: '', stderr: '' }
      },
    )
    const { runPsSync } = await loadFresh()
    runPsSync('script', 'in')
    expect(capturedInput).toBe('in')
  })
})

describe.sequential('secrets/windows — readDpapi', () => {
  test('returns undefined when file does not exist', async () => {
    const { readDpapi } = await loadFresh()
    expect(await readDpapi(path.join(tmpRoot, 'absent.enc'))).toBeUndefined()
  })

  test('returns undefined when PowerShell decode fails (status != 0)', async () => {
    const filePath = path.join(tmpRoot, 'corrupt.enc')
    writeFileSync(filePath, 'garbage')
    mockSpawn.mockImplementationOnce(() => makeFakeChild({ exitCode: 1 }))
    const { readDpapi } = await loadFresh()
    expect(await readDpapi(filePath)).toBeUndefined()
  })

  test('returns trimmed stdout on success', async () => {
    const filePath = path.join(tmpRoot, 'ok.enc')
    writeFileSync(filePath, 'base64data')
    mockSpawn.mockImplementationOnce(() =>
      makeFakeChild({ stdout: 'recovered-secret\n', exitCode: 0 }),
    )
    const { readDpapi } = await loadFresh()
    expect(await readDpapi(filePath)).toBe('recovered-secret')
  })

  test('returns undefined when decoded stdout is empty after trim', async () => {
    const filePath = path.join(tmpRoot, 'empty.enc')
    writeFileSync(filePath, 'b')
    mockSpawn.mockImplementationOnce(() =>
      makeFakeChild({ stdout: '   ', exitCode: 0 }),
    )
    const { readDpapi } = await loadFresh()
    expect(await readDpapi(filePath)).toBeUndefined()
  })
})

describe.sequential('secrets/windows — readDpapiSync', () => {
  test('returns undefined when file does not exist', async () => {
    const { readDpapiSync } = await loadFresh()
    expect(readDpapiSync(path.join(tmpRoot, 'absent.enc'))).toBeUndefined()
  })

  test('returns trimmed stdout on success', async () => {
    const filePath = path.join(tmpRoot, 'ok.enc')
    writeFileSync(filePath, 'b')
    mockSpawnSync.mockReturnValueOnce({
      status: 0,
      stdout: 'sync-secret\n',
      stderr: '',
    })
    const { readDpapiSync } = await loadFresh()
    expect(readDpapiSync(filePath)).toBe('sync-secret')
  })

  test('returns undefined when PowerShell decode fails', async () => {
    const filePath = path.join(tmpRoot, 'bad.enc')
    writeFileSync(filePath, 'b')
    mockSpawnSync.mockReturnValueOnce({ status: 1, stdout: '', stderr: '' })
    const { readDpapiSync } = await loadFresh()
    expect(readDpapiSync(filePath)).toBeUndefined()
  })

  test('returns undefined when sync decoded stdout is empty after trim', async () => {
    const filePath = path.join(tmpRoot, 'empty-sync.enc')
    writeFileSync(filePath, 'b')
    mockSpawnSync.mockReturnValueOnce({
      status: 0,
      stdout: '   ',
      stderr: '',
    })
    const { readDpapiSync } = await loadFresh()
    expect(readDpapiSync(filePath)).toBeUndefined()
  })
})

describe.sequential('secrets/windows — readWindows', () => {
  test('returns CredentialManager value when status === 0', async () => {
    mockSpawn.mockImplementationOnce(() =>
      makeFakeChild({ stdout: 'cm-value\n', exitCode: 0 }),
    )
    const { readWindows } = await loadFresh()
    expect(await readWindows('svc', 'acc')).toBe('cm-value')
  })

  test('falls back to DPAPI when CredentialManager misses', async () => {
    // 1st spawn: CM (returns non-zero); 2nd: DPAPI decode (success).
    const filePath = path.join(tmpRoot, 'svc', 'acc.enc')
    require('node:fs').mkdirSync(path.dirname(filePath), { recursive: true })
    writeFileSync(filePath, 'b64')
    mockSpawn
      .mockImplementationOnce(() => makeFakeChild({ exitCode: 1 }))
      .mockImplementationOnce(() =>
        makeFakeChild({ stdout: 'dpapi-value\n', exitCode: 0 }),
      )
    const { readWindows } = await loadFresh()
    expect(await readWindows('svc', 'acc')).toBe('dpapi-value')
  })

  test('returns undefined when both CM and DPAPI miss', async () => {
    mockSpawn.mockImplementation(() => makeFakeChild({ exitCode: 1 }))
    const { readWindows } = await loadFresh()
    expect(await readWindows('svc', 'acc')).toBeUndefined()
  })

  test('falls back to DPAPI when CM returns status=0 but empty stdout', async () => {
    // CM exited 0 but stdout was whitespace-only — must still try DPAPI.
    const filePath = path.join(tmpRoot, 'svc', 'acc.enc')
    require('node:fs').mkdirSync(path.dirname(filePath), { recursive: true })
    writeFileSync(filePath, 'b64')
    mockSpawn
      .mockImplementationOnce(() =>
        makeFakeChild({ stdout: '   \n', exitCode: 0 }),
      )
      .mockImplementationOnce(() =>
        makeFakeChild({ stdout: 'dpapi-value\n', exitCode: 0 }),
      )
    const { readWindows } = await loadFresh()
    expect(await readWindows('svc', 'acc')).toBe('dpapi-value')
  })
})

describe.sequential('secrets/windows — readWindowsSync', () => {
  test('returns CM value when status === 0', async () => {
    mockSpawnSync.mockReturnValueOnce({
      status: 0,
      stdout: 'sync-cm\n',
      stderr: '',
    })
    const { readWindowsSync } = await loadFresh()
    expect(readWindowsSync('svc', 'acc')).toBe('sync-cm')
  })

  test('falls back to DPAPI sync when CM misses', async () => {
    const filePath = path.join(tmpRoot, 'svc', 'acc.enc')
    require('node:fs').mkdirSync(path.dirname(filePath), { recursive: true })
    writeFileSync(filePath, 'b64')
    mockSpawnSync
      .mockReturnValueOnce({ status: 1, stdout: '', stderr: '' })
      .mockReturnValueOnce({
        status: 0,
        stdout: 'dpapi-sync\n',
        stderr: '',
      })
    const { readWindowsSync } = await loadFresh()
    expect(readWindowsSync('svc', 'acc')).toBe('dpapi-sync')
  })

  test('falls back to DPAPI sync when CM returns status=0 but empty stdout', async () => {
    const filePath = path.join(tmpRoot, 'svc', 'acc.enc')
    require('node:fs').mkdirSync(path.dirname(filePath), { recursive: true })
    writeFileSync(filePath, 'b64')
    mockSpawnSync
      .mockReturnValueOnce({ status: 0, stdout: '   \n', stderr: '' })
      .mockReturnValueOnce({
        status: 0,
        stdout: 'dpapi-sync-fallback\n',
        stderr: '',
      })
    const { readWindowsSync } = await loadFresh()
    expect(readWindowsSync('svc', 'acc')).toBe('dpapi-sync-fallback')
  })
})

describe.sequential('secrets/windows — writeDpapi', () => {
  test('creates parent dir + invokes PowerShell with token on stdin', async () => {
    const filePath = path.join(tmpRoot, 'new-dir', 'item.enc')
    expect(existsSync(path.dirname(filePath))).toBe(false)
    let capturedInput: unknown
    mockSpawn.mockImplementationOnce(() => {
      const c = makeFakeChild({ exitCode: 0 })
      const writes: string[] = []
      c.stdin = new Writable({
        write(chunk, _e, cb) {
          writes.push(String(chunk))
          cb()
        },
        final(cb) {
          capturedInput = writes.join('')
          cb()
        },
      })
      return c
    })
    const { writeDpapi } = await loadFresh()
    await writeDpapi(filePath, 'secret-token')
    expect(existsSync(path.dirname(filePath))).toBe(true)
    expect(capturedInput).toBe('secret-token')
  })

  test('throws with CredentialManager install hint on PowerShell failure', async () => {
    const filePath = path.join(tmpRoot, 'fail.enc')
    mockSpawn.mockImplementationOnce(() =>
      makeFakeChild({ exitCode: 1, stderr: 'crypto error' }),
    )
    const { writeDpapi } = await loadFresh()
    await expect(writeDpapi(filePath, 'v')).rejects.toThrow(
      /crypto error.*Install-Module CredentialManager/s,
    )
  })
})

describe.sequential('secrets/windows — writeDpapiSync', () => {
  test('returns silently on status 0', async () => {
    mockSpawnSync.mockReturnValueOnce({ status: 0, stderr: '' })
    const { writeDpapiSync } = await loadFresh()
    expect(() =>
      writeDpapiSync(path.join(tmpRoot, 'svc', 'acc.enc'), 'v'),
    ).not.toThrow()
  })

  test('throws with install hint on non-zero status', async () => {
    mockSpawnSync.mockReturnValueOnce({
      status: 1,
      stderr: 'sync-crypto-err',
    })
    const { writeDpapiSync } = await loadFresh()
    expect(() => writeDpapiSync(path.join(tmpRoot, 'a.enc'), 'v')).toThrow(
      /sync-crypto-err.*CredentialManager/s,
    )
  })
})

describe.sequential('secrets/windows — writeWindows', () => {
  test('returns silently when CredentialManager succeeds', async () => {
    mockSpawn.mockImplementationOnce(() => makeFakeChild({ exitCode: 0 }))
    const { writeWindows } = await loadFresh()
    await expect(
      writeWindows('svc', 'acc', 'v', 'lbl'),
    ).resolves.toBeUndefined()
  })

  test('falls back to DPAPI when CredentialManager fails', async () => {
    mockSpawn
      // CM call returns non-zero
      .mockImplementationOnce(() => makeFakeChild({ exitCode: 1 }))
      // DPAPI fallback succeeds
      .mockImplementationOnce(() => makeFakeChild({ exitCode: 0 }))
    const { writeWindows } = await loadFresh()
    await expect(
      writeWindows('svc', 'acc', 'v', 'lbl'),
    ).resolves.toBeUndefined()
  })

  test('throws when both CM and DPAPI fail', async () => {
    mockSpawn.mockImplementation(() =>
      makeFakeChild({ exitCode: 1, stderr: 'fail' }),
    )
    const { writeWindows } = await loadFresh()
    await expect(writeWindows('svc', 'acc', 'v', 'lbl')).rejects.toThrow(
      /CredentialManager/,
    )
  })
})

describe.sequential('secrets/windows — writeWindowsSync', () => {
  test('returns silently when CM succeeds', async () => {
    mockSpawnSync.mockReturnValueOnce({ status: 0, stdout: '', stderr: '' })
    const { writeWindowsSync } = await loadFresh()
    expect(() => writeWindowsSync('svc', 'acc', 'v', 'lbl')).not.toThrow()
  })

  test('falls back to DPAPI sync when CM fails', async () => {
    mockSpawnSync
      .mockReturnValueOnce({ status: 1, stdout: '', stderr: '' })
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' })
    const { writeWindowsSync } = await loadFresh()
    expect(() => writeWindowsSync('svc', 'acc', 'v', 'lbl')).not.toThrow()
  })
})

describe.sequential('secrets/windows — deleteWindows', () => {
  test('returns "removed" when CredentialManager removes successfully', async () => {
    mockSpawn.mockImplementationOnce(() => makeFakeChild({ exitCode: 0 }))
    const { deleteWindows } = await loadFresh()
    expect(await deleteWindows('svc', 'acc')).toBe('removed')
  })

  test('returns "removed" when only DPAPI file exists', async () => {
    const filePath = path.join(tmpRoot, 'svc', 'acc.enc')
    require('node:fs').mkdirSync(path.dirname(filePath), { recursive: true })
    writeFileSync(filePath, 'b64')
    mockSpawn.mockImplementationOnce(() => makeFakeChild({ exitCode: 1 }))
    const { deleteWindows } = await loadFresh()
    expect(await deleteWindows('svc', 'acc')).toBe('removed')
    expect(existsSync(filePath)).toBe(false)
  })

  test('returns "absent" when CM misses and no DPAPI file exists', async () => {
    mockSpawn.mockImplementationOnce(() => makeFakeChild({ exitCode: 1 }))
    const { deleteWindows } = await loadFresh()
    expect(await deleteWindows('svc', 'acc')).toBe('absent')
  })
})

describe.sequential('secrets/windows — deleteWindowsSync', () => {
  test('returns "removed" when CM removes successfully', async () => {
    mockSpawnSync.mockReturnValueOnce({ status: 0, stdout: '', stderr: '' })
    const { deleteWindowsSync } = await loadFresh()
    expect(deleteWindowsSync('svc', 'acc')).toBe('removed')
  })

  test('returns "removed" when only DPAPI file exists', async () => {
    const filePath = path.join(tmpRoot, 'svc', 'acc.enc')
    require('node:fs').mkdirSync(path.dirname(filePath), { recursive: true })
    writeFileSync(filePath, 'b64')
    mockSpawnSync.mockReturnValueOnce({ status: 1, stdout: '', stderr: '' })
    const { deleteWindowsSync } = await loadFresh()
    expect(deleteWindowsSync('svc', 'acc')).toBe('removed')
    expect(existsSync(filePath)).toBe(false)
  })

  test('returns "absent" when CM misses and no DPAPI file', async () => {
    mockSpawnSync.mockReturnValueOnce({ status: 1, stdout: '', stderr: '' })
    const { deleteWindowsSync } = await loadFresh()
    expect(deleteWindowsSync('svc', 'acc')).toBe('absent')
  })
})
