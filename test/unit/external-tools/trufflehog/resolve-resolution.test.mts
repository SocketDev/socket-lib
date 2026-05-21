import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../../../../src/external-tools/trufflehog/from-vfs', () => ({
  trufflehogFromVfs: vi.fn(),
}))
vi.mock('../../../../src/external-tools/trufflehog/from-path', () => ({
  trufflehogFromPath: vi.fn(),
}))
vi.mock('../../../../src/external-tools/trufflehog/from-download', () => ({
  trufflehogFromDownload: vi.fn(),
}))

async function loadFresh() {
  const vfsMod = await import('../../../../src/external-tools/trufflehog/from-vfs')
  const pathMod = await import('../../../../src/external-tools/trufflehog/from-path')
  const dlMod = await import(
    '../../../../src/external-tools/trufflehog/from-download'
  )
  const mod = await import('../../../../src/external-tools/trufflehog/resolve')
  return {
    fromVfs: vfsMod.trufflehogFromVfs as ReturnType<typeof vi.fn>,
    fromPath: pathMod.trufflehogFromPath as ReturnType<typeof vi.fn>,
    fromDownload: dlMod.trufflehogFromDownload as ReturnType<typeof vi.fn>,
    doResolveTrufflehog: mod.doResolveTrufflehog,
    resolveTrufflehog: mod.resolveTrufflehog,
    resetTrufflehogResolution: mod.resetTrufflehogResolution,
  }
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe.sequential('external-tools/trufflehog/resolve — doResolveTrufflehog', () => {
  test('returns the PATH result when trufflehog is on PATH', async () => {
    const { doResolveTrufflehog, fromPath, fromVfs } = await loadFresh()
    fromVfs.mockResolvedValueOnce(undefined)
    const expected = { binaryPath: '/usr/bin/trufflehog', source: 'path' as const }
    fromPath.mockResolvedValueOnce(expected)
    expect(await doResolveTrufflehog()).toBe(expected)
  })

  test('returns undefined when PATH misses and downloadIfMissing is absent', async () => {
    const { doResolveTrufflehog, fromPath, fromVfs } = await loadFresh()
    fromVfs.mockResolvedValueOnce(undefined)
    fromPath.mockResolvedValueOnce(undefined)
    expect(await doResolveTrufflehog()).toBeUndefined()
  })

  test('falls through to download when PATH misses and opts.downloadIfMissing is set', async () => {
    const { doResolveTrufflehog, fromDownload, fromPath, fromVfs } =
      await loadFresh()
    fromVfs.mockResolvedValueOnce(undefined)
    fromPath.mockResolvedValueOnce(undefined)
    const expected = { binaryPath: '/cache/trufflehog', source: 'download' as const }
    fromDownload.mockResolvedValueOnce(expected)
    const opts = {
      downloadIfMissing: { platformArch: 'darwin-arm64', version: '1.22.0' },
    }
    expect(await doResolveTrufflehog(opts)).toBe(expected)
    expect(fromDownload).toHaveBeenCalledWith(opts.downloadIfMissing)
  })
})

describe.sequential('external-tools/trufflehog/resolve — resolveTrufflehog memoization', () => {
  test('memoizes by cacheKey within one module instance', async () => {
    const { fromPath, fromVfs, resolveTrufflehog } = await loadFresh()
    fromVfs.mockResolvedValue(undefined)
    const expected = { binaryPath: '/usr/bin/trufflehog', source: 'path' as const }
    fromPath.mockResolvedValueOnce(expected)
    const a = await resolveTrufflehog()
    const b = await resolveTrufflehog()
    expect(a).toBe(expected)
    expect(b).toBe(expected)
    expect(fromPath).toHaveBeenCalledTimes(1)
  })

  test('uses separate cache slots for different option shapes', async () => {
    const { fromDownload, fromPath, fromVfs, resolveTrufflehog } = await loadFresh()
    fromVfs.mockResolvedValue(undefined)
    fromPath.mockResolvedValue(undefined)
    const dl = { binaryPath: '/cache/trufflehog', source: 'download' as const }
    fromDownload.mockResolvedValue(dl)
    const localOnly = await resolveTrufflehog()
    const withDl = await resolveTrufflehog({
      downloadIfMissing: { platformArch: 'darwin-arm64', version: '1.22.0' },
    })
    expect(localOnly).toBeUndefined()
    expect(withDl).toBe(dl)
  })

  test('resetTrufflehogResolution clears the memoization cache', async () => {
    const { fromPath, fromVfs, resetTrufflehogResolution, resolveTrufflehog } =
      await loadFresh()
    fromVfs.mockResolvedValue(undefined)
    const first = { binaryPath: '/usr/bin/trufflehog', source: 'path' as const }
    const second = {
      binaryPath: '/usr/local/bin/trufflehog',
      source: 'path' as const,
    }
    fromPath.mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    expect(await resolveTrufflehog()).toBe(first)
    resetTrufflehogResolution()
    expect(await resolveTrufflehog()).toBe(second)
    expect(fromPath).toHaveBeenCalledTimes(2)
  })
})
