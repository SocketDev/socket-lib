import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock(import('../../../../src/external-tools/janus/from-vfs'), () => ({
  janusFromVfs: vi.fn(),
}))
vi.mock(import('../../../../src/external-tools/janus/from-path'), () => ({
  janusFromPath: vi.fn(),
}))
vi.mock(import('../../../../src/external-tools/janus/from-download'), () => ({
  janusFromDownload: vi.fn(),
}))

async function loadFresh() {
  const vfsMod = await import('../../../../src/external-tools/janus/from-vfs')
  const pathMod = await import('../../../../src/external-tools/janus/from-path')
  const dlMod =
    await import('../../../../src/external-tools/janus/from-download')
  const mod = await import('../../../../src/external-tools/janus/resolve')
  return {
    fromVfs: vfsMod.janusFromVfs as ReturnType<typeof vi.fn>,
    fromPath: pathMod.janusFromPath as ReturnType<typeof vi.fn>,
    fromDownload: dlMod.janusFromDownload as ReturnType<typeof vi.fn>,
    doResolveJanus: mod.doResolveJanus,
    resolveJanus: mod.resolveJanus,
    resetJanusResolution: mod.resetJanusResolution,
  }
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe.sequential('external-tools/janus/resolve — doResolveJanus', () => {
  test('returns the PATH result when janus is on PATH', async () => {
    const { doResolveJanus, fromPath, fromVfs } = await loadFresh()
    fromVfs.mockResolvedValueOnce(undefined)
    const expected = { binaryPath: '/usr/bin/janus', source: 'path' as const }
    fromPath.mockResolvedValueOnce(expected)
    expect(await doResolveJanus()).toBe(expected)
  })

  test('returns undefined when PATH misses and downloadIfMissing is absent', async () => {
    const { doResolveJanus, fromPath, fromVfs } = await loadFresh()
    fromVfs.mockResolvedValueOnce(undefined)
    fromPath.mockResolvedValueOnce(undefined)
    expect(await doResolveJanus()).toBeUndefined()
  })

  test('falls through to download when PATH misses and opts.downloadIfMissing is set', async () => {
    const { doResolveJanus, fromDownload, fromPath, fromVfs } =
      await loadFresh()
    fromVfs.mockResolvedValueOnce(undefined)
    fromPath.mockResolvedValueOnce(undefined)
    const expected = { binaryPath: '/cache/janus', source: 'download' as const }
    fromDownload.mockResolvedValueOnce(expected)
    const opts = {
      downloadIfMissing: { platformArch: 'darwin-arm64', version: '1.22.0' },
    }
    expect(await doResolveJanus(opts)).toBe(expected)
    expect(fromDownload).toHaveBeenCalledWith(opts.downloadIfMissing)
  })
})

describe.sequential('external-tools/janus/resolve — resolveJanus memoization', () => {
  test('memoizes by cacheKey within one module instance', async () => {
    const { fromPath, fromVfs, resolveJanus } = await loadFresh()
    fromVfs.mockResolvedValue(undefined)
    const expected = { binaryPath: '/usr/bin/janus', source: 'path' as const }
    fromPath.mockResolvedValueOnce(expected)
    const a = await resolveJanus()
    const b = await resolveJanus()
    expect(a).toBe(expected)
    expect(b).toBe(expected)
    expect(fromPath).toHaveBeenCalledTimes(1)
  })

  test('uses separate cache slots for different option shapes', async () => {
    const { fromDownload, fromPath, fromVfs, resolveJanus } = await loadFresh()
    fromVfs.mockResolvedValue(undefined)
    fromPath.mockResolvedValue(undefined)
    const dl = { binaryPath: '/cache/janus', source: 'download' as const }
    fromDownload.mockResolvedValue(dl)
    const localOnly = await resolveJanus()
    const withDl = await resolveJanus({
      downloadIfMissing: { platformArch: 'darwin-arm64', version: '1.22.0' },
    })
    expect(localOnly).toBeUndefined()
    expect(withDl).toBe(dl)
  })

  test('resetJanusResolution clears the memoization cache', async () => {
    const { fromPath, fromVfs, resetJanusResolution, resolveJanus } =
      await loadFresh()
    fromVfs.mockResolvedValue(undefined)
    const first = { binaryPath: '/usr/bin/janus', source: 'path' as const }
    const second = {
      binaryPath: '/usr/local/bin/janus',
      source: 'path' as const,
    }
    fromPath.mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    expect(await resolveJanus()).toBe(first)
    resetJanusResolution()
    expect(await resolveJanus()).toBe(second)
    expect(fromPath).toHaveBeenCalledTimes(2)
  })
})
