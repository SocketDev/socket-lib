/**
 * @file Tests for src/external-tools/python/uv-install.ts. `uvProjectTargetDir`
 *   is pure and covered directly; `uvSyncProject` + `uvExportMaterialize` are
 *   covered with mocked spawn + filesystem so the test never spawns uv and
 *   never sleeps for real (the lock-poll loop uses fake timers).
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { uvProjectTargetDir } from '../../../../src/external-tools/python/uv-install'

import type * as NodeFs from 'node:fs'

vi.mock(import('../../../../src/process/spawn/child'), () => ({
  spawn: vi.fn(),
}))

vi.mock(import('../../../../src/fs/safe'), () => ({
  safeDelete: vi.fn(),
  safeMkdir: vi.fn(),
}))

vi.mock(import('node:fs'), async () => {
  const actual = await vi.importActual<typeof NodeFs>('node:fs')
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readdir: vi.fn(),
      readFile: vi.fn(),
      writeFile: vi.fn(),
    },
  }
})

async function loadFresh() {
  const spawnMod = await import('../../../../src/process/spawn/child')
  const fsMod = await import('node:fs')
  const mod = await import('../../../../src/external-tools/python/uv-install')
  return {
    uvExportMaterialize: mod.uvExportMaterialize,
    uvSyncProject: mod.uvSyncProject,
    readdirMock: fsMod.promises.readdir as ReturnType<typeof vi.fn>,
    readFileMock: fsMod.promises.readFile as ReturnType<typeof vi.fn>,
    writeFileMock: fsMod.promises.writeFile as ReturnType<typeof vi.fn>,
    spawnMock: spawnMod.spawn as ReturnType<typeof vi.fn>,
  }
}

function eexist(): NodeJS.ErrnoException {
  const e = new Error('exists') as NodeJS.ErrnoException
  e.code = 'EEXIST'
  return e
}

const PROJECT = '/repo/skillspector'
const UV = '/dlx/uv/bin/uv'

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('external-tools/python/uv-install — uvProjectTargetDir', () => {
  test('lands under _dlx/<cacheKey>/site-packages', () => {
    const dir = uvProjectTargetDir(PROJECT)
    const norm = dir.replace(/\\/g, '/')
    expect(norm).toMatch(/\/_dlx\/[a-f0-9]{16}\/site-packages$/)
  })

  test('is deterministic per project and differs across projects', () => {
    const a = uvProjectTargetDir(PROJECT)
    const b = uvProjectTargetDir(PROJECT)
    const c = uvProjectTargetDir('/repo/other')
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })
})

describe.sequential('external-tools/python/uv-install — uvSyncProject', () => {
  test('runs uv sync --locked --project by default', async () => {
    const { uvSyncProject, spawnMock } = await loadFresh()
    await uvSyncProject({ projectDir: PROJECT, uvBin: UV })
    expect(spawnMock).toHaveBeenCalledTimes(1)
    const [bin, args] = spawnMock.mock.calls[0]! as [string, string[]]
    expect(bin).toBe(UV)
    expect(args).toEqual(['sync', '--locked', '--project', PROJECT])
  })

  test('omits --locked when locked:false (bootstrap/refresh path)', async () => {
    const { uvSyncProject, spawnMock } = await loadFresh()
    await uvSyncProject({ projectDir: PROJECT, uvBin: UV, locked: false })
    const args = spawnMock.mock.calls[0]![1] as string[]
    expect(args).not.toContain('--locked')
    expect(args).toEqual(['sync', '--project', PROJECT])
  })
})

describe.sequential('external-tools/python/uv-install — uvExportMaterialize', () => {
  test('exports the locked closure then pip-installs --target', async () => {
    const { uvExportMaterialize, readdirMock, spawnMock } = await loadFresh()
    // pre-check empty → not installed; post-install → installed.
    readdirMock.mockResolvedValueOnce([]).mockResolvedValueOnce(['pkg'])
    const result = await uvExportMaterialize({
      projectDir: PROJECT,
      uvBin: UV,
    })
    expect(result.installed).toBe(true)
    // Two spawns: `uv export` then `uv pip install`.
    expect(spawnMock).toHaveBeenCalledTimes(2)
    const exportArgs = spawnMock.mock.calls[0]![1] as string[]
    expect(exportArgs[0]).toBe('export')
    expect(exportArgs).toContain('--locked')
    expect(exportArgs).toContain('--no-emit-project')
    const installArgs = spawnMock.mock.calls[1]![1] as string[]
    expect(installArgs.slice(0, 2)).toEqual(['pip', 'install'])
    expect(installArgs).toContain('--target')
  })

  test('honors an explicit targetDir override', async () => {
    const { uvExportMaterialize, readdirMock, spawnMock } = await loadFresh()
    readdirMock.mockResolvedValueOnce([]).mockResolvedValueOnce(['pkg'])
    const result = await uvExportMaterialize({
      projectDir: PROJECT,
      uvBin: UV,
      targetDir: '/custom/target',
    })
    expect(result.targetDir).toBe('/custom/target')
    const installArgs = spawnMock.mock.calls[1]![1] as string[]
    expect(installArgs).toContain('/custom/target')
  })

  test('skips when the target dir is already non-empty', async () => {
    const { uvExportMaterialize, readdirMock, spawnMock } = await loadFresh()
    readdirMock.mockResolvedValueOnce(['pkg'])
    const result = await uvExportMaterialize({
      projectDir: PROJECT,
      uvBin: UV,
    })
    expect(result.installed).toBe(false)
    expect(spawnMock).not.toHaveBeenCalled()
  })

  test('recovers from a stale lock: deletes it, retries, installs', async () => {
    const {
      uvExportMaterialize,
      readFileMock,
      readdirMock,
      spawnMock,
      writeFileMock,
    } = await loadFresh()
    readdirMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(['pkg'])
    writeFileMock
      .mockRejectedValueOnce(eexist())
      .mockResolvedValueOnce(undefined)
    // Dead PID → isStaleLock true.
    readFileMock.mockResolvedValueOnce('2147483646')
    const result = await uvExportMaterialize({
      projectDir: PROJECT,
      uvBin: UV,
    })
    expect(result.installed).toBe(true)
    // export + install on the winning attempt.
    expect(spawnMock).toHaveBeenCalledTimes(2)
  })

  test('a peer finishing first is observed on retry (no double-install)', async () => {
    const {
      uvExportMaterialize,
      readFileMock,
      readdirMock,
      spawnMock,
      writeFileMock,
    } = await loadFresh()
    readdirMock.mockResolvedValueOnce([]).mockResolvedValueOnce(['pkg'])
    writeFileMock.mockRejectedValueOnce(eexist())
    readFileMock.mockResolvedValueOnce('2147483646')
    const result = await uvExportMaterialize({
      projectDir: PROJECT,
      uvBin: UV,
    })
    expect(result.installed).toBe(false)
    expect(spawnMock).not.toHaveBeenCalled()
  })

  test('a live lock holder is polled until the target appears', async () => {
    vi.useFakeTimers()
    try {
      const { uvExportMaterialize, readFileMock, readdirMock, writeFileMock } =
        await loadFresh()
      // pre-check empty, then the poll loop sees it populated on the 1st tick.
      readdirMock.mockResolvedValueOnce([]).mockResolvedValueOnce(['pkg'])
      writeFileMock.mockRejectedValueOnce(eexist())
      // A live PID (this process) → isStaleLock false → enter the poll loop.
      readFileMock.mockResolvedValueOnce(process.pid.toString())
      const promise = uvExportMaterialize({ projectDir: PROJECT, uvBin: UV })
      await vi.advanceTimersByTimeAsync(1000)
      const result = await promise
      expect(result.installed).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  test('throws when uv reports success but the target stays empty', async () => {
    const { uvExportMaterialize, readdirMock } = await loadFresh()
    // pre-check empty, post-install still empty → the verify throws.
    readdirMock.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    await expect(
      uvExportMaterialize({ projectDir: PROJECT, uvBin: UV }),
    ).rejects.toThrow(/reported success but the target is still empty/)
  })

  test('throws after MAX_RETRIES when the lock can never be acquired', async () => {
    vi.useFakeTimers()
    try {
      const { uvExportMaterialize, readFileMock, readdirMock, writeFileMock } =
        await loadFresh()
      // Always not-installed so the loop never short-circuits on the target.
      readdirMock.mockResolvedValue([])
      // writeFile always loses the race; the held lock is always a live PID,
      // so each attempt polls WAIT_TICKS times then recurses → MAX_RETRIES.
      writeFileMock.mockRejectedValue(eexist())
      readFileMock.mockResolvedValue(process.pid.toString())
      const promise = uvExportMaterialize({ projectDir: PROJECT, uvBin: UV })
      const assertion = expect(promise).rejects.toThrow(
        /could not acquire install lock after 3 retries/,
      )
      // Drain every poll sleep across all retries.
      await vi.runAllTimersAsync()
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })

  test('rethrows a non-EEXIST writeFile error', async () => {
    const { uvExportMaterialize, readdirMock, writeFileMock } =
      await loadFresh()
    readdirMock.mockResolvedValueOnce([])
    const eacces = new Error('denied') as NodeJS.ErrnoException
    eacces.code = 'EACCES'
    writeFileMock.mockRejectedValueOnce(eacces)
    await expect(
      uvExportMaterialize({ projectDir: PROJECT, uvBin: UV }),
    ).rejects.toThrow('denied')
  })

  test('treats an unreadable lock file as stale and retries', async () => {
    const { uvExportMaterialize, readFileMock, readdirMock, writeFileMock } =
      await loadFresh()
    readdirMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(['pkg'])
    writeFileMock
      .mockRejectedValueOnce(eexist())
      .mockResolvedValueOnce(undefined)
    // readFile throws → the catch sets stale=true.
    readFileMock.mockRejectedValueOnce(new Error('gone'))
    const result = await uvExportMaterialize({
      projectDir: PROJECT,
      uvBin: UV,
    })
    expect(result.installed).toBe(true)
  })
})
