import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock(import('../../../../src/external-tools/skillspector/from-vfs'), () => ({
  skillspectorFromVfs: vi.fn(),
  SKILLSPECTOR_VFS_KEY: 'skillspector' as const,
}))

vi.mock(
  import('../../../../src/external-tools/skillspector/from-path'),
  () => ({
    skillspectorFromPath: vi.fn(),
  }),
)

vi.mock(import('../../../../src/external-tools/skillspector/from-dlx'), () => ({
  skillspectorFromDlx: vi.fn(),
}))

async function loadFresh() {
  const vfsMod =
    await import('../../../../src/external-tools/skillspector/from-vfs')
  const pathMod =
    await import('../../../../src/external-tools/skillspector/from-path')
  const dlxMod =
    await import('../../../../src/external-tools/skillspector/from-dlx')
  const mod =
    await import('../../../../src/external-tools/skillspector/resolve')
  return {
    vfsMock: vfsMod.skillspectorFromVfs as ReturnType<typeof vi.fn>,
    pathMock: pathMod.skillspectorFromPath as ReturnType<typeof vi.fn>,
    dlxMock: dlxMod.skillspectorFromDlx as ReturnType<typeof vi.fn>,
    doResolveSkillSpector: mod.doResolveSkillSpector,
    resolveSkillSpector: mod.resolveSkillSpector,
  }
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe.sequential('external-tools/skillspector/resolve resolution order', () => {
  test('returns the VFS hit when present, skipping PATH + DLX', async () => {
    const { doResolveSkillSpector, vfsMock, pathMock, dlxMock } =
      await loadFresh()
    vfsMock.mockResolvedValueOnce({
      path: '/vfs/skillspector',
      source: 'vfs',
    })
    const result = await doResolveSkillSpector({ sha: 'abc1234' })
    expect(result).toEqual({ path: '/vfs/skillspector', source: 'vfs' })
    expect(pathMock).not.toHaveBeenCalled()
    expect(dlxMock).not.toHaveBeenCalled()
  })

  test('falls through VFS miss to PATH', async () => {
    const { doResolveSkillSpector, vfsMock, pathMock, dlxMock } =
      await loadFresh()
    vfsMock.mockResolvedValueOnce(undefined)
    pathMock.mockResolvedValueOnce({
      path: '/usr/local/bin/skillspector',
      source: 'path',
    })
    const result = await doResolveSkillSpector({ sha: 'abc1234' })
    expect(result).toEqual({
      path: '/usr/local/bin/skillspector',
      source: 'path',
    })
    expect(dlxMock).not.toHaveBeenCalled()
  })

  test('falls through VFS + PATH misses to DLX', async () => {
    const { doResolveSkillSpector, vfsMock, pathMock, dlxMock } =
      await loadFresh()
    vfsMock.mockResolvedValueOnce(undefined)
    pathMock.mockResolvedValueOnce(undefined)
    dlxMock.mockResolvedValueOnce({
      path: '/dlx/cache/bin/skillspector',
      source: 'dlx',
    })
    const result = await doResolveSkillSpector({ sha: 'abc1234' })
    expect(result?.source).toBe('dlx')
    expect(dlxMock).toHaveBeenCalledWith({
      sha: 'abc1234',
      cacheDir: undefined,
    })
  })

  test('returns undefined when localOnly=true and VFS+PATH both miss', async () => {
    const { doResolveSkillSpector, vfsMock, pathMock, dlxMock } =
      await loadFresh()
    vfsMock.mockResolvedValueOnce(undefined)
    pathMock.mockResolvedValueOnce(undefined)
    const result = await doResolveSkillSpector({
      sha: 'abc1234',
      localOnly: true,
    })
    expect(result).toBeUndefined()
    expect(dlxMock).not.toHaveBeenCalled()
  })

  test('returns undefined when sha is omitted and VFS+PATH both miss', async () => {
    const { doResolveSkillSpector, vfsMock, pathMock, dlxMock } =
      await loadFresh()
    vfsMock.mockResolvedValueOnce(undefined)
    pathMock.mockResolvedValueOnce(undefined)
    const result = await doResolveSkillSpector({})
    expect(result).toBeUndefined()
    expect(dlxMock).not.toHaveBeenCalled()
  })

  test('returns undefined when all three tiers miss', async () => {
    const { doResolveSkillSpector, vfsMock, pathMock, dlxMock } =
      await loadFresh()
    vfsMock.mockResolvedValueOnce(undefined)
    pathMock.mockResolvedValueOnce(undefined)
    dlxMock.mockResolvedValueOnce(undefined)
    const result = await doResolveSkillSpector({ sha: 'abc1234' })
    expect(result).toBeUndefined()
  })

  test('passes cacheDir to the DLX tier', async () => {
    const { doResolveSkillSpector, vfsMock, pathMock, dlxMock } =
      await loadFresh()
    vfsMock.mockResolvedValueOnce(undefined)
    pathMock.mockResolvedValueOnce(undefined)
    dlxMock.mockResolvedValueOnce({ path: '/x', source: 'dlx' })
    await doResolveSkillSpector({
      sha: 'abc1234',
      cacheDir: '/custom/cache',
    })
    expect(dlxMock).toHaveBeenCalledWith({
      sha: 'abc1234',
      cacheDir: '/custom/cache',
    })
  })

  test('memoizes via the public resolveSkillSpector — second call reuses the first', async () => {
    const { resolveSkillSpector, vfsMock, pathMock } = await loadFresh()
    vfsMock.mockResolvedValueOnce(undefined)
    pathMock.mockResolvedValueOnce({
      path: '/usr/local/bin/skillspector',
      source: 'path',
    })
    const first = await resolveSkillSpector({ sha: 'abc1234' })
    const second = await resolveSkillSpector({ sha: 'abc1234' })
    expect(second).toBe(first)
    // VFS + PATH only invoked once each — the memo hit short-circuits.
    expect(vfsMock).toHaveBeenCalledTimes(1)
    expect(pathMock).toHaveBeenCalledTimes(1)
  })

  test('different opts produce separate memo entries', async () => {
    const { resolveSkillSpector, vfsMock, pathMock } = await loadFresh()
    vfsMock.mockResolvedValue(undefined)
    pathMock.mockResolvedValue({
      path: '/usr/local/bin/skillspector',
      source: 'path',
    })
    await resolveSkillSpector({ sha: 'abc1234' })
    await resolveSkillSpector({ sha: 'def5678' })
    expect(vfsMock).toHaveBeenCalledTimes(2)
    expect(pathMock).toHaveBeenCalledTimes(2)
  })
})
