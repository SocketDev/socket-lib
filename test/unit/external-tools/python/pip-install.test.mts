/**
 * @file Tests for src/external-tools/python/pip-install.ts. `pipPackageDir` is
 *   pure and covered directly; `downloadPipPackage` is covered with mocked
 *   spawn + filesystem so the test never spawns pip.
 */

import process from 'node:process'
import { safeDelete } from '../../../../src/fs/safe.mjs'

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { normalizePath } from '../../../../src/paths/normalize.mjs'
import {
  isAlreadyInstalled,
  isStaleLock,
  pipPackageDir,
} from '../../../../src/external-tools/python/pip-install.mjs'

import type * as NodeFs from 'node:fs'

vi.mock(import('../../../../src/process/spawn/child.mjs'), () => ({
  spawn: vi.fn(),
}))

vi.mock(import('../../../../src/fs/safe.mjs'), () => ({
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
  const spawnMod = await import('../../../../src/process/spawn/child.mjs')
  const fsMod = await import('node:fs')
  const mod =
    await import('../../../../src/external-tools/python/pip-install.mjs')
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
  vi.resetAllMocks()
  vi.resetModules()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('external-tools/python/pip-install — pipPackageDir', () => {
  test('lands under _dlx/<cacheKey>/site-packages', () => {
    const dir = pipPackageDir(
      'git+https://github.com/NVIDIA/skillspector.git@abc1234',
    )
    expect(normalizePath(dir)).toMatch(/\/_dlx\/[a-f0-9]{16}\/site-packages$/)
  })

  test('is deterministic per spec and differs across specs', () => {
    const a = pipPackageDir('skillspector==1.0.0')
    const b = pipPackageDir('skillspector==1.0.0')
    const c = pipPackageDir('skillspector==2.0.0')
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })
})

describe(
  'external-tools/python/pip-install — downloadPipPackage',
  { concurrent: false },
  () => {
    test('runs pip install --target without --require-hashes when no hash', async () => {
      const { downloadPipPackage, readdirMock, spawnMock } = await loadFresh()
      // First readdir (pre-check) empty → not installed; second (post-spawn) → installed.
      readdirMock
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(['skillspector'])
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
      readdirMock
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(['skillspector'])
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
      readdirMock
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(['skillspector'])
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
      // The three readdir results in order: not-installed at the pre-check,
      // not-installed at the retry pre-check, installed at the post-spawn
      // verify.
      readdirMock
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(['skillspector'])
      // First writeFile loses the lock race (EEXIST); the second one after the
      // retry wins.
      writeFileMock
        .mockRejectedValueOnce(eexist())
        .mockResolvedValueOnce(undefined)
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
      readdirMock
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(['skillspector'])
      writeFileMock.mockRejectedValueOnce(eexist())
      readFileMock.mockResolvedValueOnce('2147483646')
      const result = await downloadPipPackage({
        pythonBin: '/dlx/python/bin/python3',
        spec: 'skillspector==1.0.0',
      })
      expect(result.installed).toBe(false)
      expect(spawnMock).not.toHaveBeenCalled()
    })
  },
)

describe('pip installation lock failures', () => {
  const options = {
    pythonBin: '/example/python',
    spec: 'example-package==1.0.0',
  }

  test('propagates permission failures without starting pip', async () => {
    const { downloadPipPackage, readdirMock, spawnMock, writeFileMock } =
      await loadFresh()
    const error = Object.assign(new Error('write denied'), { code: 'EACCES' })
    readdirMock.mockResolvedValue([])
    writeFileMock.mockRejectedValue(error)
    await expect(downloadPipPackage(options)).rejects.toBe(error)
    expect(spawnMock).not.toHaveBeenCalled()
    expect(safeDelete).not.toHaveBeenCalled()
  })

  test('bounds retries for unreadable stale locks', async () => {
    const {
      downloadPipPackage,
      readdirMock,
      readFileMock,
      spawnMock,
      writeFileMock,
    } = await loadFresh()
    readdirMock.mockResolvedValue([])
    writeFileMock.mockRejectedValue(eexist())
    readFileMock.mockRejectedValue(new Error('lock disappeared'))
    await expect(downloadPipPackage(options)).rejects.toBeInstanceOf(Error)
    expect(writeFileMock).toHaveBeenCalledTimes(3)
    expect(safeDelete).toHaveBeenCalledTimes(3)
    expect(spawnMock).not.toHaveBeenCalled()
  })

  test('waits for a live peer and reuses its installation', async () => {
    vi.useFakeTimers()
    vi.spyOn(process, 'kill').mockReturnValue(true)
    const {
      downloadPipPackage,
      readdirMock,
      readFileMock,
      spawnMock,
      writeFileMock,
    } = await loadFresh()
    readdirMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValue(['example-package'])
    writeFileMock.mockRejectedValue(eexist())
    readFileMock.mockResolvedValue('12345')
    const pending = downloadPipPackage(options)
    await vi.advanceTimersByTimeAsync(2000)
    const result = await pending
    expect(result.installed).toBe(false)
    expect(normalizePath(result.packageDir)).toMatch(/\/site-packages$/)
    expect(spawnMock).not.toHaveBeenCalled()
    expect(safeDelete).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  test('stops after bounded waits without deleting a live peer lock', async () => {
    vi.useFakeTimers()
    vi.spyOn(process, 'kill').mockReturnValue(true)
    const {
      downloadPipPackage,
      readdirMock,
      readFileMock,
      spawnMock,
      writeFileMock,
    } = await loadFresh()
    readdirMock.mockResolvedValue([])
    writeFileMock.mockRejectedValue(eexist())
    readFileMock.mockResolvedValue('12345')
    const observed = expect(downloadPipPackage(options)).rejects.toBeInstanceOf(
      Error,
    )
    await vi.advanceTimersByTimeAsync(90_000)
    await observed
    expect(writeFileMock).toHaveBeenCalledTimes(3)
    expect(spawnMock).not.toHaveBeenCalled()
    expect(safeDelete).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  test('rejects an empty target after pip success and releases its lock', async () => {
    const { downloadPipPackage, readdirMock, spawnMock } = await loadFresh()
    readdirMock.mockResolvedValue([])
    await expect(downloadPipPackage(options)).rejects.toBeInstanceOf(Error)
    expect(spawnMock).toHaveBeenCalledTimes(1)
    expect(safeDelete).toHaveBeenCalledTimes(1)
  })

  test('releases its lock when pip rejects', async () => {
    const { downloadPipPackage, readdirMock, spawnMock } = await loadFresh()
    const error = new Error('pip failed')
    readdirMock.mockResolvedValue([])
    spawnMock.mockRejectedValue(error)
    await expect(downloadPipPackage(options)).rejects.toBe(error)
    expect(safeDelete).toHaveBeenCalledTimes(1)
  })

  test('treats an unreadable target as uninstalled', async () => {
    const { readdirMock } = await loadFresh()
    readdirMock.mockRejectedValue(new Error('target missing'))
    expect(await isAlreadyInstalled('/example/target')).toBe(false)
  })

  test.each([Number.NaN, 0, -1])(
    'rejects invalid lock PID %s without probing',
    pid => {
      const kill = vi.spyOn(process, 'kill')
      expect(isStaleLock(pid)).toBe(true)
      expect(kill).not.toHaveBeenCalled()
    },
  )

  test.each([
    ['EPERM', false],
    ['ESRCH', true],
  ])('classifies probe error %s', (code, stale) => {
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('probe failed'), { code })
    })
    expect(isStaleLock(12_345)).toBe(stale)
  })
})
