import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../../../../src/external-tools/trivy/from-vfs', () => ({
  trivyFromVfs: vi.fn(),
}))
vi.mock('../../../../src/external-tools/trivy/from-path', () => ({
  trivyFromPath: vi.fn(),
}))
vi.mock('../../../../src/external-tools/trivy/from-download', () => ({
  trivyFromDownload: vi.fn(),
}))

async function loadFresh() {
  const vfsMod = await import('../../../../src/external-tools/trivy/from-vfs')
  const pathMod = await import('../../../../src/external-tools/trivy/from-path')
  const dlMod =
    await import('../../../../src/external-tools/trivy/from-download')
  const mod = await import('../../../../src/external-tools/trivy/resolve')
  return {
    fromVfs: vfsMod.trivyFromVfs as ReturnType<typeof vi.fn>,
    fromPath: pathMod.trivyFromPath as ReturnType<typeof vi.fn>,
    fromDownload: dlMod.trivyFromDownload as ReturnType<typeof vi.fn>,
    doResolveTrivy: mod.doResolveTrivy,
    resolveTrivy: mod.resolveTrivy,
    resetTrivyResolution: mod.resetTrivyResolution,
  }
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe.sequential('external-tools/trivy/resolve — doResolveTrivy', () => {
  test('returns the PATH result when trivy is on PATH', async () => {
    const { doResolveTrivy, fromPath, fromVfs } = await loadFresh()
    fromVfs.mockResolvedValueOnce(undefined)
    const expected = { binaryPath: '/usr/bin/trivy', source: 'path' as const }
    fromPath.mockResolvedValueOnce(expected)
    expect(await doResolveTrivy()).toBe(expected)
  })

  test('returns undefined when PATH misses and downloadIfMissing is absent', async () => {
    const { doResolveTrivy, fromPath, fromVfs } = await loadFresh()
    fromVfs.mockResolvedValueOnce(undefined)
    fromPath.mockResolvedValueOnce(undefined)
    expect(await doResolveTrivy()).toBeUndefined()
  })

  test('falls through to download when PATH misses and opts.downloadIfMissing is set', async () => {
    const { doResolveTrivy, fromDownload, fromPath, fromVfs } =
      await loadFresh()
    fromVfs.mockResolvedValueOnce(undefined)
    fromPath.mockResolvedValueOnce(undefined)
    const expected = { binaryPath: '/cache/trivy', source: 'download' as const }
    fromDownload.mockResolvedValueOnce(expected)
    const opts = {
      downloadIfMissing: { platformArch: 'darwin-arm64', version: '1.22.0' },
    }
    expect(await doResolveTrivy(opts)).toBe(expected)
    expect(fromDownload).toHaveBeenCalledWith(opts.downloadIfMissing)
  })
})

describe.sequential('external-tools/trivy/resolve — resolveTrivy memoization', () => {
  test('memoizes by cacheKey within one module instance', async () => {
    const { fromPath, fromVfs, resolveTrivy } = await loadFresh()
    fromVfs.mockResolvedValue(undefined)
    const expected = { binaryPath: '/usr/bin/trivy', source: 'path' as const }
    fromPath.mockResolvedValueOnce(expected)
    const a = await resolveTrivy()
    const b = await resolveTrivy()
    expect(a).toBe(expected)
    expect(b).toBe(expected)
    expect(fromPath).toHaveBeenCalledTimes(1)
  })

  test('uses separate cache slots for different option shapes', async () => {
    const { fromDownload, fromPath, fromVfs, resolveTrivy } = await loadFresh()
    fromVfs.mockResolvedValue(undefined)
    fromPath.mockResolvedValue(undefined)
    const dl = { binaryPath: '/cache/trivy', source: 'download' as const }
    fromDownload.mockResolvedValue(dl)
    const localOnly = await resolveTrivy()
    const withDl = await resolveTrivy({
      downloadIfMissing: { platformArch: 'darwin-arm64', version: '1.22.0' },
    })
    expect(localOnly).toBeUndefined()
    expect(withDl).toBe(dl)
  })

  test('resetTrivyResolution clears the memoization cache', async () => {
    const { fromPath, fromVfs, resetTrivyResolution, resolveTrivy } =
      await loadFresh()
    fromVfs.mockResolvedValue(undefined)
    const first = { binaryPath: '/usr/bin/trivy', source: 'path' as const }
    const second = {
      binaryPath: '/usr/local/bin/trivy',
      source: 'path' as const,
    }
    fromPath.mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    expect(await resolveTrivy()).toBe(first)
    resetTrivyResolution()
    expect(await resolveTrivy()).toBe(second)
    expect(fromPath).toHaveBeenCalledTimes(2)
  })
})
