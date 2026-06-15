/**
 * @file Tests for src/external-tools/skillspector/from-uv.ts. Mocks
 *   uvSyncProject + existsSync so the test never spawns uv or touches disk.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { venvEntryPoint } from '../../../../src/external-tools/skillspector/from-uv'

import type * as NodeFs from 'node:fs'

vi.mock(import('../../../../src/external-tools/python/uv-install'), () => ({
  uvSyncProject: vi.fn(),
}))

vi.mock(import('node:fs'), async () => {
  const actual = await vi.importActual<typeof NodeFs>('node:fs')
  return { ...actual, existsSync: vi.fn() }
})

async function loadFresh() {
  const uvMod = await import('../../../../src/external-tools/python/uv-install')
  const fsMod = await import('node:fs')
  const mod =
    await import('../../../../src/external-tools/skillspector/from-uv')
  return {
    skillspectorFromUv: mod.skillspectorFromUv,
    syncMock: uvMod.uvSyncProject as ReturnType<typeof vi.fn>,
    existsMock: fsMod.existsSync as ReturnType<typeof vi.fn>,
  }
}

const PROJECT = '/repo/skillspector'
const UV = '/dlx/uv/bin/uv'

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('skillspector/from-uv — venvEntryPoint', () => {
  test('POSIX form is .venv/bin/skillspector', () => {
    const p = venvEntryPoint('/x').replace(/\\/g, '/')
    // On the test host (non-win32) the POSIX branch is taken.
    expect(p.endsWith('/.venv/bin/skillspector')).toBe(true)
  })
})

describe.sequential('skillspector/from-uv — skillspectorFromUv', () => {
  test('undefined when projectDir is missing', async () => {
    const { skillspectorFromUv, syncMock } = await loadFresh()
    const r = await skillspectorFromUv({ projectDir: '', uvBin: UV })
    expect(r).toBeUndefined()
    expect(syncMock).not.toHaveBeenCalled()
  })

  test('undefined when uvBin is missing', async () => {
    const { skillspectorFromUv, syncMock } = await loadFresh()
    const r = await skillspectorFromUv({ projectDir: PROJECT, uvBin: '' })
    expect(r).toBeUndefined()
    expect(syncMock).not.toHaveBeenCalled()
  })

  test('undefined when the project lacks pyproject/uv.lock', async () => {
    const { skillspectorFromUv, syncMock, existsMock } = await loadFresh()
    // pyproject.toml absent → bail before syncing.
    existsMock.mockReturnValue(false)
    const r = await skillspectorFromUv({ projectDir: PROJECT, uvBin: UV })
    expect(r).toBeUndefined()
    expect(syncMock).not.toHaveBeenCalled()
  })

  test('undefined when uv sync --locked throws', async () => {
    const { skillspectorFromUv, syncMock, existsMock } = await loadFresh()
    // pyproject + lock present → attempt sync, which fails.
    existsMock.mockReturnValueOnce(true).mockReturnValueOnce(true)
    syncMock.mockRejectedValueOnce(new Error('lock drift'))
    const r = await skillspectorFromUv({ projectDir: PROJECT, uvBin: UV })
    expect(r).toBeUndefined()
  })

  test('undefined when sync succeeds but the entry point is absent', async () => {
    const { skillspectorFromUv, syncMock, existsMock } = await loadFresh()
    // pyproject(true), lock(true), then entry point(false).
    existsMock
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
    syncMock.mockResolvedValueOnce(undefined)
    const r = await skillspectorFromUv({ projectDir: PROJECT, uvBin: UV })
    expect(r).toBeUndefined()
  })

  test('resolves with source="uv" on a successful locked sync', async () => {
    const { skillspectorFromUv, syncMock, existsMock } = await loadFresh()
    existsMock
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
    syncMock.mockResolvedValueOnce(undefined)
    const r = await skillspectorFromUv({ projectDir: PROJECT, uvBin: UV })
    expect(r?.source).toBe('uv')
    expect(r?.path.replace(/\\/g, '/')).toContain('/.venv/bin/skillspector')
    expect(syncMock).toHaveBeenCalledWith({ projectDir: PROJECT, uvBin: UV })
  })
})
