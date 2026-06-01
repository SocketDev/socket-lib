import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../../../../src/external-tools/from-pip-venv', () => ({
  createPipVenv: vi.fn(),
}))

vi.mock('../../../../src/paths/socket', () => ({
  getSocketDlxDir: vi.fn(() => '/fake/dlx'),
}))

async function loadFresh() {
  const venvMod = await import(
    '../../../../src/external-tools/from-pip-venv'
  )
  const createMock = venvMod.createPipVenv as ReturnType<typeof vi.fn>
  const mod = await import(
    '../../../../src/external-tools/skillspector/from-dlx'
  )
  return { createMock, skillspectorFromDlx: mod.skillspectorFromDlx }
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe.sequential('external-tools/skillspector/from-dlx', () => {
  test('returns undefined when sha is empty', async () => {
    const { skillspectorFromDlx, createMock } = await loadFresh()
    const result = await skillspectorFromDlx({ sha: '' })
    expect(result).toBeUndefined()
    expect(createMock).not.toHaveBeenCalled()
  })

  test('returns ResolvedSkillSpector with source="dlx" on success', async () => {
    const { skillspectorFromDlx, createMock } = await loadFresh()
    createMock.mockResolvedValueOnce({
      entryPointPath: '/fake/dlx/skillspector/abc1234/bin/skillspector',
      created: true,
    })
    const result = await skillspectorFromDlx({ sha: 'abc1234' })
    expect(result).toEqual({
      path: '/fake/dlx/skillspector/abc1234/bin/skillspector',
      source: 'dlx',
    })
  })

  test('passes the canonical NVIDIA repo + sha as the install spec', async () => {
    const { skillspectorFromDlx, createMock } = await loadFresh()
    createMock.mockResolvedValueOnce({
      entryPointPath: '/x/skillspector',
      created: true,
    })
    await skillspectorFromDlx({ sha: 'abc1234' })
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        entryPoint: 'skillspector',
        installSpec: 'git+https://github.com/NVIDIA/skillspector.git@abc1234',
      }),
    )
  })

  test('defaults cache dir to getSocketDlxDir()/skillspector/<sha>', async () => {
    const { skillspectorFromDlx, createMock } = await loadFresh()
    createMock.mockResolvedValueOnce({
      entryPointPath: '/x/skillspector',
      created: true,
    })
    await skillspectorFromDlx({ sha: 'abc1234' })
    const call = createMock.mock.calls[0]![0] as { cacheDir: string }
    expect(call.cacheDir).toBe(
      path.join('/fake/dlx', 'skillspector', 'abc1234'),
    )
  })

  test('honors caller-supplied cacheDir override', async () => {
    const { skillspectorFromDlx, createMock } = await loadFresh()
    createMock.mockResolvedValueOnce({
      entryPointPath: '/x/skillspector',
      created: true,
    })
    await skillspectorFromDlx({
      sha: 'abc1234',
      cacheDir: '/custom/cache/dir',
    })
    const call = createMock.mock.calls[0]![0] as { cacheDir: string }
    expect(call.cacheDir).toBe('/custom/cache/dir')
  })

  test('returns undefined when createPipVenv throws (e.g. no Python)', async () => {
    const { skillspectorFromDlx, createMock } = await loadFresh()
    createMock.mockRejectedValueOnce(new Error('no Python on PATH'))
    const result = await skillspectorFromDlx({ sha: 'abc1234' })
    expect(result).toBeUndefined()
  })
})
