/**
 * @file Tests for src/external-tools/from-pip-venv.ts. Pure helpers are covered
 *   directly; the venv-creation function is covered with mocked spawn +
 *   filesystem so the test never spawns Python.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { pipVenvEntryPointPath } from '../../../src/external-tools/from-pip-venv'

import type { which as WhichFn } from '../../../src/bin/which'
import type * as NodeFs from 'node:fs'

vi.mock(import('../../../src/bin/which'), () => ({
  which: vi.fn<
    (
      name: string,
      opts?: { nothrow?: boolean | undefined } | undefined,
    ) => Promise<string | undefined>
  >() as unknown as typeof WhichFn,
}))

vi.mock(import('../../../src/process/spawn/child'), () => ({
  spawn: vi.fn(),
}))

vi.mock(import('node:fs'), async () => {
  const actual = await vi.importActual<typeof NodeFs>('node:fs')
  return {
    ...actual,
    existsSync: vi.fn(),
  }
})

vi.mock(import('../../../src/fs/safe'), () => ({
  safeMkdir: vi.fn(async () => undefined),
}))

async function loadFresh() {
  const whichMod = await import('../../../src/bin/which')
  const spawnMod = await import('../../../src/process/spawn/child')
  const fsMod = await import('node:fs')
  const mod = await import('../../../src/external-tools/from-pip-venv')
  return {
    whichMock: whichMod.which as ReturnType<typeof vi.fn>,
    spawnMock: spawnMod.spawn as ReturnType<typeof vi.fn>,
    existsMock: fsMod.existsSync as ReturnType<typeof vi.fn>,
    findPython: mod.findPython,
    createPipVenv: mod.createPipVenv,
  }
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe.sequential('external-tools/from-pip-venv / pipVenvEntryPointPath', () => {
  test('Unix layout uses bin/<name>', () => {
    // pipVenvEntryPointPath reads process.platform at call time; the test
    // host's platform dictates the result. Assert against the platform we
    // run on.
    const result = pipVenvEntryPointPath('/cache/venv', 'skillspector')
    if (process.platform === 'win32') {
      expect(result.endsWith('Scripts\\skillspector.exe')).toBe(true)
    } else {
      expect(result.endsWith('bin/skillspector')).toBe(true)
    }
  })

  test('different entry points produce different paths', () => {
    const a = pipVenvEntryPointPath('/cache/venv', 'foo')
    const b = pipVenvEntryPointPath('/cache/venv', 'bar')
    expect(a).not.toBe(b)
  })

  test('different cache dirs produce different paths', () => {
    const a = pipVenvEntryPointPath('/cache/a', 'tool')
    const b = pipVenvEntryPointPath('/cache/b', 'tool')
    expect(a).not.toBe(b)
  })
})

describe.sequential('external-tools/from-pip-venv / findPython', () => {
  test('returns the first Python found on PATH', async () => {
    const { findPython, whichMock } = await loadFresh()
    whichMock.mockResolvedValueOnce('/usr/bin/python3')
    const result = await findPython()
    if (process.platform === 'win32') {
      expect(whichMock).toHaveBeenCalledWith('python', { nothrow: true })
    } else {
      expect(whichMock).toHaveBeenCalledWith('python3', { nothrow: true })
    }
    expect(result).toBe('/usr/bin/python3')
  })

  test('falls back to the secondary candidate when the first misses', async () => {
    const { findPython, whichMock } = await loadFresh()
    whichMock.mockResolvedValueOnce(undefined)
    whichMock.mockResolvedValueOnce('/usr/bin/python')
    const result = await findPython()
    expect(result).toBe('/usr/bin/python')
    expect(whichMock).toHaveBeenCalledTimes(2)
  })

  test('returns undefined when no Python is on PATH', async () => {
    const { findPython, whichMock } = await loadFresh()
    whichMock.mockResolvedValue(undefined)
    const result = await findPython()
    expect(result).toBeUndefined()
  })
})

describe.sequential('external-tools/from-pip-venv / createPipVenv', () => {
  test('cache hit: returns existing entry-point without spawning', async () => {
    const { createPipVenv, existsMock, spawnMock, whichMock } =
      await loadFresh()
    // First existsSync (entry-point) returns true → cache hit.
    existsMock.mockReturnValue(true)
    const result = await createPipVenv({
      cacheDir: '/cache/venv',
      entryPoint: 'tool',
      installSpec: 'tool==1.0.0',
    })
    expect(result.created).toBe(false)
    expect(result.entryPointPath).toContain('tool')
    expect(spawnMock).not.toHaveBeenCalled()
    expect(whichMock).not.toHaveBeenCalled()
  })

  test('cache miss: creates venv then pip-installs', async () => {
    const { createPipVenv, existsMock, spawnMock, whichMock } =
      await loadFresh()
    // 1st existsSync (entry-point check) → false (cache miss)
    // 2nd existsSync (venv python check) → true (venv created)
    // 3rd existsSync (post-install entry-point check) → true (install OK)
    existsMock
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
    whichMock.mockResolvedValueOnce('/usr/bin/python3')
    spawnMock.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 })
    const result = await createPipVenv({
      cacheDir: '/cache/venv',
      entryPoint: 'tool',
      installSpec: 'tool==1.0.0',
    })
    expect(result.created).toBe(true)
    // Two spawn calls: venv create, pip install.
    expect(spawnMock).toHaveBeenCalledTimes(2)
    const venvCall = spawnMock.mock.calls[0]!
    expect(venvCall[0]).toBe('/usr/bin/python3')
    expect(venvCall[1]).toEqual(['-m', 'venv', '--clear', '/cache/venv'])
    const pipCall = spawnMock.mock.calls[1]!
    expect(pipCall[1]).toContain('install')
    expect(pipCall[1]).toContain('tool==1.0.0')
  })

  test('throws when no Python is on PATH', async () => {
    const { createPipVenv, existsMock, whichMock } = await loadFresh()
    existsMock.mockReturnValueOnce(false)
    whichMock.mockResolvedValue(undefined)
    await expect(
      createPipVenv({
        cacheDir: '/cache/venv',
        entryPoint: 'tool',
        installSpec: 'tool==1.0.0',
      }),
    ).rejects.toThrow(/no Python interpreter/)
  })

  test('throws when venv create succeeds but the venv python is missing', async () => {
    const { createPipVenv, existsMock, spawnMock, whichMock } =
      await loadFresh()
    // entry-point check → miss; venv python → missing (venv broken)
    existsMock.mockReturnValueOnce(false).mockReturnValueOnce(false)
    whichMock.mockResolvedValueOnce('/usr/bin/python3')
    spawnMock.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 })
    await expect(
      createPipVenv({
        cacheDir: '/cache/venv',
        entryPoint: 'tool',
        installSpec: 'tool==1.0.0',
      }),
    ).rejects.toThrow(/venv created.*is missing/)
  })

  test('throws when pip install succeeds but entry-point not created', async () => {
    const { createPipVenv, existsMock, spawnMock, whichMock } =
      await loadFresh()
    // entry-point check → miss; venv python → present; post-install entry-point → still missing
    existsMock
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
    whichMock.mockResolvedValueOnce('/usr/bin/python3')
    spawnMock.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 })
    await expect(
      createPipVenv({
        cacheDir: '/cache/venv',
        entryPoint: 'tool',
        installSpec: 'tool==1.0.0',
      }),
    ).rejects.toThrow(/entry-point.*was not created/)
  })

  test('caller-supplied python override skips findPython', async () => {
    const { createPipVenv, existsMock, spawnMock, whichMock } =
      await loadFresh()
    existsMock
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
    spawnMock.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 })
    const result = await createPipVenv({
      cacheDir: '/cache/venv',
      entryPoint: 'tool',
      installSpec: 'tool==1.0.0',
      python: '/custom/python',
    })
    expect(result.created).toBe(true)
    // findPython was not consulted because the caller provided python.
    expect(whichMock).not.toHaveBeenCalled()
    expect(spawnMock.mock.calls[0]![0]).toBe('/custom/python')
  })

  test('passes --no-input + --disable-pip-version-check to pip install', async () => {
    const { createPipVenv, existsMock, spawnMock, whichMock } =
      await loadFresh()
    existsMock
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
    whichMock.mockResolvedValueOnce('/usr/bin/python3')
    spawnMock.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 })
    await createPipVenv({
      cacheDir: '/cache/venv',
      entryPoint: 'tool',
      installSpec: 'tool==1.0.0',
    })
    const pipArgs = spawnMock.mock.calls[1]![1] as string[]
    expect(pipArgs).toContain('--no-input')
    expect(pipArgs).toContain('--disable-pip-version-check')
  })

  test('git-SHA installSpec is passed through verbatim', async () => {
    const { createPipVenv, existsMock, spawnMock, whichMock } =
      await loadFresh()
    existsMock
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
    whichMock.mockResolvedValueOnce('/usr/bin/python3')
    spawnMock.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 })
    const gitSpec = 'git+https://github.com/NVIDIA/skillspector.git@abc1234'
    await createPipVenv({
      cacheDir: '/cache/venv',
      entryPoint: 'skillspector',
      installSpec: gitSpec,
    })
    const pipArgs = spawnMock.mock.calls[1]![1] as string[]
    expect(pipArgs[pipArgs.length - 1]).toBe(gitSpec)
  })
})
