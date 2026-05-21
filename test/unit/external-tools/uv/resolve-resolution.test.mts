import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../../../../src/external-tools/uv/from-vfs', () => ({
  uvFromVfs: vi.fn(),
}))
vi.mock('../../../../src/external-tools/uv/from-path', () => ({
  uvFromPath: vi.fn(),
}))
vi.mock('../../../../src/external-tools/uv/from-download', () => ({
  uvFromDownload: vi.fn(),
}))

async function loadFresh() {
  const vfsMod = await import('../../../../src/external-tools/uv/from-vfs')
  const pathMod = await import('../../../../src/external-tools/uv/from-path')
  const dlMod = await import(
    '../../../../src/external-tools/uv/from-download'
  )
  const mod = await import('../../../../src/external-tools/uv/resolve')
  return {
    fromVfs: vfsMod.uvFromVfs as ReturnType<typeof vi.fn>,
    fromPath: pathMod.uvFromPath as ReturnType<typeof vi.fn>,
    fromDownload: dlMod.uvFromDownload as ReturnType<typeof vi.fn>,
    doResolveUv: mod.doResolveUv,
    resolveUv: mod.resolveUv,
    resetUvResolution: mod.resetUvResolution,
  }
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe.sequential('external-tools/uv/resolve — doResolveUv', () => {
  test('returns the PATH result when uv is on PATH', async () => {
    const { doResolveUv, fromPath, fromVfs } = await loadFresh()
    fromVfs.mockResolvedValueOnce(undefined)
    const expected = { binaryPath: '/usr/bin/uv', source: 'path' as const }
    fromPath.mockResolvedValueOnce(expected)
    expect(await doResolveUv()).toBe(expected)
  })

  test('returns undefined when PATH misses and downloadIfMissing is absent', async () => {
    const { doResolveUv, fromPath, fromVfs } = await loadFresh()
    fromVfs.mockResolvedValueOnce(undefined)
    fromPath.mockResolvedValueOnce(undefined)
    expect(await doResolveUv()).toBeUndefined()
  })

  test('falls through to download when PATH misses and opts.downloadIfMissing is set', async () => {
    const { doResolveUv, fromDownload, fromPath, fromVfs } =
      await loadFresh()
    fromVfs.mockResolvedValueOnce(undefined)
    fromPath.mockResolvedValueOnce(undefined)
    const expected = { binaryPath: '/cache/uv', source: 'download' as const }
    fromDownload.mockResolvedValueOnce(expected)
    const opts = {
      downloadIfMissing: { platformArch: 'darwin-arm64', version: '1.22.0' },
    }
    expect(await doResolveUv(opts)).toBe(expected)
    expect(fromDownload).toHaveBeenCalledWith(opts.downloadIfMissing)
  })
})

describe.sequential('external-tools/uv/resolve — resolveUv memoization', () => {
  test('memoizes by cacheKey within one module instance', async () => {
    const { fromPath, fromVfs, resolveUv } = await loadFresh()
    fromVfs.mockResolvedValue(undefined)
    const expected = { binaryPath: '/usr/bin/uv', source: 'path' as const }
    fromPath.mockResolvedValueOnce(expected)
    const a = await resolveUv()
    const b = await resolveUv()
    expect(a).toBe(expected)
    expect(b).toBe(expected)
    expect(fromPath).toHaveBeenCalledTimes(1)
  })

  test('uses separate cache slots for different option shapes', async () => {
    const { fromDownload, fromPath, fromVfs, resolveUv } = await loadFresh()
    fromVfs.mockResolvedValue(undefined)
    fromPath.mockResolvedValue(undefined)
    const dl = { binaryPath: '/cache/uv', source: 'download' as const }
    fromDownload.mockResolvedValue(dl)
    const localOnly = await resolveUv()
    const withDl = await resolveUv({
      downloadIfMissing: { platformArch: 'darwin-arm64', version: '1.22.0' },
    })
    expect(localOnly).toBeUndefined()
    expect(withDl).toBe(dl)
  })

  test('resetUvResolution clears the memoization cache', async () => {
    const { fromPath, fromVfs, resetUvResolution, resolveUv } =
      await loadFresh()
    fromVfs.mockResolvedValue(undefined)
    const first = { binaryPath: '/usr/bin/uv', source: 'path' as const }
    const second = {
      binaryPath: '/usr/local/bin/uv',
      source: 'path' as const,
    }
    fromPath.mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    expect(await resolveUv()).toBe(first)
    resetUvResolution()
    expect(await resolveUv()).toBe(second)
    expect(fromPath).toHaveBeenCalledTimes(2)
  })
})
