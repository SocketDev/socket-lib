import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../../../../src/external-tools/opengrep/from-vfs', () => ({
  opengrepFromVfs: vi.fn(),
}))
vi.mock('../../../../src/external-tools/opengrep/from-path', () => ({
  opengrepFromPath: vi.fn(),
}))
vi.mock('../../../../src/external-tools/opengrep/from-download', () => ({
  opengrepFromDownload: vi.fn(),
}))

async function loadFresh() {
  const vfsMod =
    await import('../../../../src/external-tools/opengrep/from-vfs')
  const pathMod =
    await import('../../../../src/external-tools/opengrep/from-path')
  const dlMod =
    await import('../../../../src/external-tools/opengrep/from-download')
  const mod = await import('../../../../src/external-tools/opengrep/resolve')
  return {
    fromVfs: vfsMod.opengrepFromVfs as ReturnType<typeof vi.fn>,
    fromPath: pathMod.opengrepFromPath as ReturnType<typeof vi.fn>,
    fromDownload: dlMod.opengrepFromDownload as ReturnType<typeof vi.fn>,
    doResolveOpengrep: mod.doResolveOpengrep,
    resolveOpengrep: mod.resolveOpengrep,
    resetOpengrepResolution: mod.resetOpengrepResolution,
  }
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe.sequential('external-tools/opengrep/resolve — doResolveOpengrep', () => {
  test('returns the PATH result when opengrep is on PATH', async () => {
    const { doResolveOpengrep, fromPath, fromVfs } = await loadFresh()
    fromVfs.mockResolvedValueOnce(undefined)
    const expected = {
      binaryPath: '/usr/bin/opengrep',
      source: 'path' as const,
    }
    fromPath.mockResolvedValueOnce(expected)
    expect(await doResolveOpengrep()).toBe(expected)
  })

  test('returns undefined when PATH misses and downloadIfMissing is absent', async () => {
    const { doResolveOpengrep, fromPath, fromVfs } = await loadFresh()
    fromVfs.mockResolvedValueOnce(undefined)
    fromPath.mockResolvedValueOnce(undefined)
    expect(await doResolveOpengrep()).toBeUndefined()
  })

  test('falls through to download when PATH misses and opts.downloadIfMissing is set', async () => {
    const { doResolveOpengrep, fromDownload, fromPath, fromVfs } =
      await loadFresh()
    fromVfs.mockResolvedValueOnce(undefined)
    fromPath.mockResolvedValueOnce(undefined)
    const expected = {
      binaryPath: '/cache/opengrep',
      source: 'download' as const,
    }
    fromDownload.mockResolvedValueOnce(expected)
    const opts = {
      downloadIfMissing: { platformArch: 'darwin-arm64', version: '1.22.0' },
    }
    expect(await doResolveOpengrep(opts)).toBe(expected)
    expect(fromDownload).toHaveBeenCalledWith(opts.downloadIfMissing)
  })
})

describe.sequential('external-tools/opengrep/resolve — resolveOpengrep memoization', () => {
  test('memoizes by cacheKey within one module instance', async () => {
    const { fromPath, fromVfs, resolveOpengrep } = await loadFresh()
    fromVfs.mockResolvedValue(undefined)
    const expected = {
      binaryPath: '/usr/bin/opengrep',
      source: 'path' as const,
    }
    fromPath.mockResolvedValueOnce(expected)
    const a = await resolveOpengrep()
    const b = await resolveOpengrep()
    expect(a).toBe(expected)
    expect(b).toBe(expected)
    expect(fromPath).toHaveBeenCalledTimes(1)
  })

  test('uses separate cache slots for different option shapes', async () => {
    const { fromDownload, fromPath, fromVfs, resolveOpengrep } =
      await loadFresh()
    fromVfs.mockResolvedValue(undefined)
    fromPath.mockResolvedValue(undefined)
    const dl = { binaryPath: '/cache/opengrep', source: 'download' as const }
    fromDownload.mockResolvedValue(dl)
    const localOnly = await resolveOpengrep()
    const withDl = await resolveOpengrep({
      downloadIfMissing: { platformArch: 'darwin-arm64', version: '1.22.0' },
    })
    expect(localOnly).toBeUndefined()
    expect(withDl).toBe(dl)
  })

  test('resetOpengrepResolution clears the memoization cache', async () => {
    const { fromPath, fromVfs, resetOpengrepResolution, resolveOpengrep } =
      await loadFresh()
    fromVfs.mockResolvedValue(undefined)
    const first = { binaryPath: '/usr/bin/opengrep', source: 'path' as const }
    const second = {
      binaryPath: '/usr/local/bin/opengrep',
      source: 'path' as const,
    }
    fromPath.mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    expect(await resolveOpengrep()).toBe(first)
    resetOpengrepResolution()
    expect(await resolveOpengrep()).toBe(second)
    expect(fromPath).toHaveBeenCalledTimes(2)
  })
})
