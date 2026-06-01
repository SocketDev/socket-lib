import { existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, test, vi } from 'vitest'

import { harness, loadFresh, setupHarness } from './windows-test-harness.mts'

import type * as ChildProcess from 'node:child_process'

const { mockSpawn, mockSpawnSync } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  mockSpawnSync: vi.fn(),
}))

vi.mock(import('node:child_process'), async () => {
  const actual = await vi.importActual<typeof ChildProcess>(
    'node:child_process',
  )
  return {
    ...actual,
    default: actual,
    spawn: mockSpawn,
    spawnSync: mockSpawnSync,
  }
})

setupHarness({ mockSpawn, mockSpawnSync })

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

describe.sequential('secrets/windows — readDpapiSync', () => {
  test('returns undefined when file does not exist', async () => {
    const { readDpapiSync } = await loadFresh()
    expect(
      readDpapiSync(path.join(harness.tmpRoot, 'absent.enc')),
    ).toBeUndefined()
  })

  test('returns trimmed stdout on success', async () => {
    const filePath = path.join(harness.tmpRoot, 'ok.enc')
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
    const filePath = path.join(harness.tmpRoot, 'bad.enc')
    writeFileSync(filePath, 'b')
    mockSpawnSync.mockReturnValueOnce({ status: 1, stdout: '', stderr: '' })
    const { readDpapiSync } = await loadFresh()
    expect(readDpapiSync(filePath)).toBeUndefined()
  })

  test('returns undefined when sync decoded stdout is empty after trim', async () => {
    const filePath = path.join(harness.tmpRoot, 'empty-sync.enc')
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
    const filePath = path.join(harness.tmpRoot, 'svc', 'acc.enc')
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
    const filePath = path.join(harness.tmpRoot, 'svc', 'acc.enc')
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

describe.sequential('secrets/windows — writeDpapiSync', () => {
  test('returns silently on status 0', async () => {
    mockSpawnSync.mockReturnValueOnce({ status: 0, stderr: '' })
    const { writeDpapiSync } = await loadFresh()
    expect(() =>
      writeDpapiSync(path.join(harness.tmpRoot, 'svc', 'acc.enc'), 'v'),
    ).not.toThrow()
  })

  test('throws with install hint on non-zero status', async () => {
    mockSpawnSync.mockReturnValueOnce({
      status: 1,
      stderr: 'sync-crypto-err',
    })
    const { writeDpapiSync } = await loadFresh()
    expect(() =>
      writeDpapiSync(path.join(harness.tmpRoot, 'a.enc'), 'v'),
    ).toThrow(/sync-crypto-err.*CredentialManager/s)
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

describe.sequential('secrets/windows — deleteWindowsSync', () => {
  test('returns "removed" when CM removes successfully', async () => {
    mockSpawnSync.mockReturnValueOnce({ status: 0, stdout: '', stderr: '' })
    const { deleteWindowsSync } = await loadFresh()
    expect(deleteWindowsSync('svc', 'acc')).toBe('removed')
  })

  test('returns "removed" when only DPAPI file exists', async () => {
    const filePath = path.join(harness.tmpRoot, 'svc', 'acc.enc')
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
