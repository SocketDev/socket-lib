import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../../../../src/external-tools/cdxgen/from-vfs', () => ({
  cdxgenFromVfs: vi.fn(),
}))
vi.mock('../../../../src/external-tools/cdxgen/from-path', () => ({
  cdxgenFromPath: vi.fn(),
}))
vi.mock('../../../../src/external-tools/cdxgen/from-download', () => ({
  cdxgenFromDownload: vi.fn(),
}))

async function loadFresh() {
  const vfsMod = await import('../../../../src/external-tools/cdxgen/from-vfs')
  const pathMod =
    await import('../../../../src/external-tools/cdxgen/from-path')
  const dlMod =
    await import('../../../../src/external-tools/cdxgen/from-download')
  const mod = await import('../../../../src/external-tools/cdxgen/resolve')
  return {
    fromVfs: vfsMod.cdxgenFromVfs as ReturnType<typeof vi.fn>,
    fromPath: pathMod.cdxgenFromPath as ReturnType<typeof vi.fn>,
    fromDownload: dlMod.cdxgenFromDownload as ReturnType<typeof vi.fn>,
    doResolveCdxgen: mod.doResolveCdxgen,
    resolveCdxgen: mod.resolveCdxgen,
    resetCdxgenResolution: mod.resetCdxgenResolution,
  }
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe.sequential('external-tools/cdxgen/resolve — doResolveCdxgen', () => {
  test('returns the PATH result when cdxgen is on PATH', async () => {
    const { doResolveCdxgen, fromPath, fromVfs } = await loadFresh()
    fromVfs.mockResolvedValueOnce(undefined)
    const expected = { binaryPath: '/usr/bin/cdxgen', source: 'path' as const }
    fromPath.mockResolvedValueOnce(expected)
    expect(await doResolveCdxgen()).toBe(expected)
  })

  test('returns undefined when PATH misses and downloadIfMissing is absent', async () => {
    const { doResolveCdxgen, fromPath, fromVfs } = await loadFresh()
    fromVfs.mockResolvedValueOnce(undefined)
    fromPath.mockResolvedValueOnce(undefined)
    expect(await doResolveCdxgen()).toBeUndefined()
  })

  test('falls through to download when PATH misses and opts.downloadIfMissing is set', async () => {
    const { doResolveCdxgen, fromDownload, fromPath, fromVfs } =
      await loadFresh()
    fromVfs.mockResolvedValueOnce(undefined)
    fromPath.mockResolvedValueOnce(undefined)
    const expected = {
      binaryPath: '/cache/cdxgen',
      source: 'download' as const,
    }
    fromDownload.mockResolvedValueOnce(expected)
    const opts = {
      downloadIfMissing: { platformArch: 'darwin-arm64', version: '1.22.0' },
    }
    expect(await doResolveCdxgen(opts)).toBe(expected)
    expect(fromDownload).toHaveBeenCalledWith(opts.downloadIfMissing)
  })
})

describe.sequential('external-tools/cdxgen/resolve — resolveCdxgen memoization', () => {
  test('memoizes by cacheKey within one module instance', async () => {
    const { fromPath, fromVfs, resolveCdxgen } = await loadFresh()
    fromVfs.mockResolvedValue(undefined)
    const expected = { binaryPath: '/usr/bin/cdxgen', source: 'path' as const }
    fromPath.mockResolvedValueOnce(expected)
    const a = await resolveCdxgen()
    const b = await resolveCdxgen()
    expect(a).toBe(expected)
    expect(b).toBe(expected)
    expect(fromPath).toHaveBeenCalledTimes(1)
  })

  test('uses separate cache slots for different option shapes', async () => {
    const { fromDownload, fromPath, fromVfs, resolveCdxgen } = await loadFresh()
    fromVfs.mockResolvedValue(undefined)
    fromPath.mockResolvedValue(undefined)
    const dl = { binaryPath: '/cache/cdxgen', source: 'download' as const }
    fromDownload.mockResolvedValue(dl)
    const localOnly = await resolveCdxgen()
    const withDl = await resolveCdxgen({
      downloadIfMissing: { platformArch: 'darwin-arm64', version: '1.22.0' },
    })
    expect(localOnly).toBeUndefined()
    expect(withDl).toBe(dl)
  })

  test('resetCdxgenResolution clears the memoization cache', async () => {
    const { fromPath, fromVfs, resetCdxgenResolution, resolveCdxgen } =
      await loadFresh()
    fromVfs.mockResolvedValue(undefined)
    const first = { binaryPath: '/usr/bin/cdxgen', source: 'path' as const }
    const second = {
      binaryPath: '/usr/local/bin/cdxgen',
      source: 'path' as const,
    }
    fromPath.mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    expect(await resolveCdxgen()).toBe(first)
    resetCdxgenResolution()
    expect(await resolveCdxgen()).toBe(second)
    expect(fromPath).toHaveBeenCalledTimes(2)
  })
})
