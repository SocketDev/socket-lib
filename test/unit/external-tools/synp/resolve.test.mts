import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { cacheKey } from '../../../../src/external-tools/synp/resolve'

vi.mock('../../../../src/external-tools/synp/from-vfs', () => ({
  synpFromVfs: vi.fn(),
}))
vi.mock('../../../../src/external-tools/synp/from-path', () => ({
  synpFromPath: vi.fn(),
}))
vi.mock('../../../../src/external-tools/synp/from-download', () => ({
  synpFromDownload: vi.fn(),
}))

async function loadFresh() {
  const vfsMod = await import('../../../../src/external-tools/synp/from-vfs')
  const pathMod = await import('../../../../src/external-tools/synp/from-path')
  const dlMod =
    await import('../../../../src/external-tools/synp/from-download')
  const mod = await import('../../../../src/external-tools/synp/resolve')
  return {
    fromVfs: vfsMod.synpFromVfs as ReturnType<typeof vi.fn>,
    fromPath: pathMod.synpFromPath as ReturnType<typeof vi.fn>,
    fromDownload: dlMod.synpFromDownload as ReturnType<typeof vi.fn>,
    doResolveSynp: mod.doResolveSynp,
    resolveSynp: mod.resolveSynp,
    resetSynpResolution: mod.resetSynpResolution,
  }
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe.sequential('external-tools/synp/resolve — cacheKey', () => {
  test('returns "local-only" when no opts are given', () => {
    expect(cacheKey(undefined)).toBe('local-only')
  })

  test('returns "local-only" when opts has no downloadIfMissing', () => {
    expect(cacheKey({})).toBe('local-only')
  })

  test('returns a download-shaped key without integrity', () => {
    expect(
      cacheKey({
        downloadIfMissing: { version: '1.9.14' },
      }),
    ).toBe('dl:1.9.14:')
  })

  test('encodes integrity when provided', () => {
    expect(
      cacheKey({
        downloadIfMissing: { version: '1.9.14', integrity: 'sha256-synp' },
      }),
    ).toBe('dl:1.9.14:sha256-synp')
  })
})

describe.sequential('external-tools/synp/resolve — doResolveSynp', () => {
  test('returns the PATH result when synp is on PATH', async () => {
    const { doResolveSynp, fromPath, fromVfs } = await loadFresh()
    fromVfs.mockResolvedValueOnce(undefined)
    const expected = { binaryPath: '/usr/bin/synp', source: 'path' as const }
    fromPath.mockResolvedValueOnce(expected)
    expect(await doResolveSynp()).toBe(expected)
  })

  test('returns undefined when PATH misses and downloadIfMissing is absent', async () => {
    const { doResolveSynp, fromPath, fromVfs } = await loadFresh()
    fromVfs.mockResolvedValueOnce(undefined)
    fromPath.mockResolvedValueOnce(undefined)
    expect(await doResolveSynp()).toBeUndefined()
  })

  test('falls through to download when PATH misses and opts.downloadIfMissing is set', async () => {
    const { doResolveSynp, fromDownload, fromPath, fromVfs } = await loadFresh()
    fromVfs.mockResolvedValueOnce(undefined)
    fromPath.mockResolvedValueOnce(undefined)
    const expected = { binaryPath: '/cache/synp', source: 'download' as const }
    fromDownload.mockResolvedValueOnce(expected)
    expect(
      await doResolveSynp({ downloadIfMissing: { version: '1.9.14' } }),
    ).toBe(expected)
    expect(fromDownload).toHaveBeenCalledWith({ version: '1.9.14' })
  })
})

describe.sequential('external-tools/synp/resolve — resolveSynp memoization', () => {
  test('memoizes by cacheKey within one module instance', async () => {
    const { fromPath, fromVfs, resolveSynp } = await loadFresh()
    fromVfs.mockResolvedValue(undefined)
    const expected = { binaryPath: '/usr/bin/synp', source: 'path' as const }
    fromPath.mockResolvedValueOnce(expected)
    const a = await resolveSynp()
    const b = await resolveSynp()
    expect(a).toBe(expected)
    expect(b).toBe(expected)
    expect(fromPath).toHaveBeenCalledTimes(1)
  })

  test('uses separate cache slots for different option shapes', async () => {
    const { fromDownload, fromPath, fromVfs, resolveSynp } = await loadFresh()
    fromVfs.mockResolvedValue(undefined)
    fromPath.mockResolvedValue(undefined)
    const dl = { binaryPath: '/cache/synp', source: 'download' as const }
    fromDownload.mockResolvedValue(dl)
    const localOnly = await resolveSynp()
    const withDl = await resolveSynp({
      downloadIfMissing: { version: '1.9.14' },
    })
    expect(localOnly).toBeUndefined()
    expect(withDl).toBe(dl)
  })

  test('resetSynpResolution clears the memoization cache', async () => {
    const { fromPath, fromVfs, resetSynpResolution, resolveSynp } =
      await loadFresh()
    fromVfs.mockResolvedValue(undefined)
    const first = { binaryPath: '/usr/bin/synp', source: 'path' as const }
    const second = {
      binaryPath: '/usr/local/bin/synp',
      source: 'path' as const,
    }
    fromPath.mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    expect(await resolveSynp()).toBe(first)
    resetSynpResolution()
    expect(await resolveSynp()).toBe(second)
    expect(fromPath).toHaveBeenCalledTimes(2)
  })
})
