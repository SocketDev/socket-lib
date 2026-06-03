/**
 * @file Tests for src/external-tools/python/pip-install.ts. `pipPackageDir` is
 *   pure and covered directly; `downloadPipPackage` is covered with mocked
 *   spawn + filesystem so the test never spawns pip.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { pipPackageDir } from '../../../../src/external-tools/python/pip-install'

import type * as NodeFs from 'node:fs'

vi.mock(import('../../../../src/process/spawn/child'), () => ({
  spawn: vi.fn(async () => undefined),
}))

vi.mock(import('../../../../src/fs/safe'), () => ({
  safeDelete: vi.fn(async () => undefined),
  safeMkdir: vi.fn(async () => undefined),
}))

vi.mock(import('node:fs'), async () => {
  const actual = await vi.importActual<typeof NodeFs>('node:fs')
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readdir: vi.fn(),
      readFile: vi.fn(),
      writeFile: vi.fn(async () => undefined),
    },
  }
})

async function loadFresh() {
  const spawnMod = await import('../../../../src/process/spawn/child')
  const fsMod = await import('node:fs')
  const mod = await import('../../../../src/external-tools/python/pip-install')
  return {
    downloadPipPackage: mod.downloadPipPackage,
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

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('external-tools/python/pip-install — pipPackageDir', () => {
  test('lands under _dlx/<cacheKey>/site-packages', () => {
    const dir = pipPackageDir(
      'git+https://github.com/NVIDIA/skillspector.git@abc1234',
    )
    const norm = dir.replace(/\\/g, '/')
    expect(norm).toMatch(/\/_dlx\/[a-f0-9]{16}\/site-packages$/)
  })

  test('is deterministic per spec and differs across specs', () => {
    const a = pipPackageDir('skillspector==1.0.0')
    const b = pipPackageDir('skillspector==1.0.0')
    const c = pipPackageDir('skillspector==2.0.0')
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })
})

describe.sequential('external-tools/python/pip-install — downloadPipPackage', () => {
  test('runs pip install --target without --require-hashes when no hash', async () => {
    const { downloadPipPackage, readdirMock, spawnMock } = await loadFresh()
    // First readdir (pre-check) empty → not installed; second (post-spawn) → installed.
    readdirMock.mockResolvedValueOnce([]).mockResolvedValueOnce(['skillspector'])
    const result = await downloadPipPackage({
      pythonBin: '/dlx/python/bin/python3',
      spec: 'skillspector==1.0.0',
    })
    expect(result.installed).toBe(true)
    const args = spawnMock.mock.calls[0]![1] as string[]
    expect(args).toContain('--target')
    expect(args).toContain('skillspector==1.0.0')
    expect(args).not.toContain('--require-hashes')
  })

  test('adds --require-hashes + sha256-normalized --hash when hash is set', async () => {
    const { downloadPipPackage, readdirMock, spawnMock } = await loadFresh()
    readdirMock.mockResolvedValueOnce([]).mockResolvedValueOnce(['skillspector'])
    await downloadPipPackage({
      hash: 'deadbeef',
      pythonBin: '/dlx/python/bin/python3',
      spec: 'skillspector==1.0.0',
    })
    const args = spawnMock.mock.calls[0]![1] as string[]
    expect(args).toContain('--require-hashes')
    expect(args).toContain('--hash=sha256:deadbeef')
  })

  test('passes an already-prefixed sha256: hash through unchanged', async () => {
    const { downloadPipPackage, readdirMock, spawnMock } = await loadFresh()
    readdirMock.mockResolvedValueOnce([]).mockResolvedValueOnce(['skillspector'])
    await downloadPipPackage({
      hash: 'sha256:cafef00d',
      pythonBin: '/dlx/python/bin/python3',
      spec: 'skillspector==1.0.0',
    })
    const args = spawnMock.mock.calls[0]![1] as string[]
    expect(args).toContain('--hash=sha256:cafef00d')
  })

  test('skips the install when the package dir is already non-empty', async () => {
    const { downloadPipPackage, readdirMock, spawnMock } = await loadFresh()
    readdirMock.mockResolvedValueOnce(['skillspector'])
    const result = await downloadPipPackage({
      pythonBin: '/dlx/python/bin/python3',
      spec: 'skillspector==1.0.0',
    })
    expect(result.installed).toBe(false)
    expect(spawnMock).not.toHaveBeenCalled()
  })

  test('recovers from a stale lock: deletes it, retries, installs', async () => {
    const {
      downloadPipPackage,
      readFileMock,
      readdirMock,
      spawnMock,
      writeFileMock,
    } = await loadFresh()
    // readdir: not-installed (pre-check), not-installed (retry pre-check),
    // installed (post-spawn verify).
    readdirMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(['skillspector'])
    // First writeFile loses the lock race (EEXIST); second (after retry) wins.
    writeFileMock.mockRejectedValueOnce(eexist()).mockResolvedValueOnce(undefined)
    // The lock holds a dead PID → isStaleLock true (process.kill throws ESRCH).
    readFileMock.mockResolvedValueOnce('2147483646')
    const result = await downloadPipPackage({
      pythonBin: '/dlx/python/bin/python3',
      spec: 'skillspector==1.0.0',
    })
    expect(result.installed).toBe(true)
    expect(spawnMock).toHaveBeenCalledTimes(1)
  })

  test('a peer that finishes the install first is observed on retry (no double-install)', async () => {
    const {
      downloadPipPackage,
      readFileMock,
      readdirMock,
      spawnMock,
      writeFileMock,
    } = await loadFresh()
    // Pre-check empty; after the stale-lock retry the dir is now populated by
    // the peer → installed:false, no spawn.
    readdirMock.mockResolvedValueOnce([]).mockResolvedValueOnce(['skillspector'])
    writeFileMock.mockRejectedValueOnce(eexist())
    readFileMock.mockResolvedValueOnce('2147483646')
    const result = await downloadPipPackage({
      pythonBin: '/dlx/python/bin/python3',
      spec: 'skillspector==1.0.0',
    })
    expect(result.installed).toBe(false)
    expect(spawnMock).not.toHaveBeenCalled()
  })
})
