import { existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { Writable } from 'node:stream'

import { describe, expect, test, vi } from 'vitest'

import { WIN32 } from '../../../src/constants/platform'
import {
  harness,
  loadFresh,
  makeFakeChild,
  setupHarness,
  spawnChildMockFactory,
} from './windows-test-harness.mts'

const { mockSpawn, mockSpawnSync } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  mockSpawnSync: vi.fn(),
}))

vi.mock(import('@socketsecurity/lib-stable/process/spawn/child'), () =>
  spawnChildMockFactory(mockSpawn, mockSpawnSync),
)

setupHarness({ mockSpawn, mockSpawnSync })

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

// %APPDATA% / AppData\Roaming path composition is Windows-specific: the source
// resolves it with Windows path semantics, so the join only matches a host
// path.join() on win32. Run these on the windows-latest matrix leg only —
// on Linux/macOS the separators diverge (CI Linux failure: "joins APPDATA …").
describe.skipIf(!WIN32).sequential('secrets/windows — getDpapiFilePath', () => {
  test('joins APPDATA / service / account.enc', async () => {
    const { getDpapiFilePath } = await loadFresh()
    expect(getDpapiFilePath('socket-cli', 'SOCKET_API_TOKEN')).toBe(
      path.join(harness.tmpRoot, 'socket-cli', 'SOCKET_API_TOKEN.enc'),
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
      c.process.stdin = new Writable({
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

describe.sequential('secrets/windows — readDpapi', () => {
  test('returns undefined when file does not exist', async () => {
    const { readDpapi } = await loadFresh()
    expect(
      await readDpapi(path.join(harness.tmpRoot, 'absent.enc')),
    ).toBeUndefined()
  })

  test('returns undefined when PowerShell decode fails (status != 0)', async () => {
    const filePath = path.join(harness.tmpRoot, 'corrupt.enc')
    writeFileSync(filePath, 'garbage')
    mockSpawn.mockImplementationOnce(() => makeFakeChild({ exitCode: 1 }))
    const { readDpapi } = await loadFresh()
    expect(await readDpapi(filePath)).toBeUndefined()
  })

  test('returns trimmed stdout on success', async () => {
    const filePath = path.join(harness.tmpRoot, 'ok.enc')
    writeFileSync(filePath, 'base64data')
    mockSpawn.mockImplementationOnce(() =>
      makeFakeChild({ stdout: 'recovered-secret\n', exitCode: 0 }),
    )
    const { readDpapi } = await loadFresh()
    expect(await readDpapi(filePath)).toBe('recovered-secret')
  })

  test('returns undefined when decoded stdout is empty after trim', async () => {
    const filePath = path.join(harness.tmpRoot, 'empty.enc')
    writeFileSync(filePath, 'b')
    mockSpawn.mockImplementationOnce(() =>
      makeFakeChild({ stdout: '   ', exitCode: 0 }),
    )
    const { readDpapi } = await loadFresh()
    expect(await readDpapi(filePath)).toBeUndefined()
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
    const filePath = path.join(harness.tmpRoot, 'svc', 'acc.enc')
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
    const filePath = path.join(harness.tmpRoot, 'svc', 'acc.enc')
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

describe.sequential('secrets/windows — writeDpapi', () => {
  test('creates parent dir + invokes PowerShell with token on stdin', async () => {
    const filePath = path.join(harness.tmpRoot, 'new-dir', 'item.enc')
    expect(existsSync(path.dirname(filePath))).toBe(false)
    let capturedInput: unknown
    mockSpawn.mockImplementationOnce(() => {
      const c = makeFakeChild({ exitCode: 0 })
      const writes: string[] = []
      c.process.stdin = new Writable({
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
    const filePath = path.join(harness.tmpRoot, 'fail.enc')
    mockSpawn.mockImplementationOnce(() =>
      makeFakeChild({ exitCode: 1, stderr: 'crypto error' }),
    )
    const { writeDpapi } = await loadFresh()
    await expect(writeDpapi(filePath, 'v')).rejects.toThrow(
      /crypto error.*Install-Module CredentialManager/s,
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

describe.sequential('secrets/windows — deleteWindows', () => {
  test('returns "removed" when CredentialManager removes successfully', async () => {
    mockSpawn.mockImplementationOnce(() => makeFakeChild({ exitCode: 0 }))
    const { deleteWindows } = await loadFresh()
    expect(await deleteWindows('svc', 'acc')).toBe('removed')
  })

  test('returns "removed" when only DPAPI file exists', async () => {
    const filePath = path.join(harness.tmpRoot, 'svc', 'acc.enc')
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
