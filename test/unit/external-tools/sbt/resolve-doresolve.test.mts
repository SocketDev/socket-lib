import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock(import('../../../../src/external-tools/sbt/from-vfs'), () => ({
  sbtFromVfs: vi.fn(),
}))
vi.mock(import('../../../../src/external-tools/sbt/from-path'), () => ({
  sbtFromPath: vi.fn(),
}))
vi.mock(import('../../../../src/external-tools/sbt/from-download'), () => ({
  sbtFromDownload: vi.fn(),
}))

async function loadFresh() {
  const vfsMod = await import('../../../../src/external-tools/sbt/from-vfs')
  const pathMod = await import('../../../../src/external-tools/sbt/from-path')
  const dlMod = await import('../../../../src/external-tools/sbt/from-download')
  const mod = await import('../../../../src/external-tools/sbt/resolve')
  return {
    fromVfs: vfsMod.sbtFromVfs as ReturnType<typeof vi.fn>,
    fromPath: pathMod.sbtFromPath as ReturnType<typeof vi.fn>,
    fromDownload: dlMod.sbtFromDownload as ReturnType<typeof vi.fn>,
    cacheKey: mod.cacheKey,
    doResolveSbt: mod.doResolveSbt,
    resolveSbt: mod.resolveSbt,
    resetSbtResolution: mod.resetSbtResolution,
  }
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe.sequential('external-tools/sbt/resolve — cacheKey', () => {
  test('returns "local-only" without downloadIfMissing', async () => {
    const { cacheKey } = await loadFresh()
    expect(cacheKey(undefined)).toBe('local-only')
    expect(cacheKey({})).toBe('local-only')
  })

  test('encodes a string integrity', async () => {
    const { cacheKey } = await loadFresh()
    expect(
      cacheKey({
        downloadIfMissing: { version: '1.9.0', integrity: 'sha256-abc' },
      }),
    ).toBe('dl:1.9.0:sha256-abc:')
  })

  test('encodes a structured integrity', async () => {
    const { cacheKey } = await loadFresh()
    expect(
      cacheKey({
        downloadIfMissing: {
          version: '1.9.0',
          integrity: { type: 'checksum', value: 'sbt-val' },
        },
      }),
    ).toBe('dl:1.9.0:checksum:sbt-val:')
  })

  test('encodes cacheDir', async () => {
    const { cacheKey } = await loadFresh()
    expect(
      cacheKey({
        downloadIfMissing: { version: '1.9.0', cacheDir: '/tmp/sbt' },
      }),
    ).toBe('dl:1.9.0::/tmp/sbt')
  })
})

describe.sequential('external-tools/sbt/resolve — doResolveSbt', () => {
  test('returns PATH result when sbt is on PATH', async () => {
    const { doResolveSbt, fromPath, fromVfs } = await loadFresh()
    fromVfs.mockResolvedValueOnce(undefined)
    const expected = { binaryPath: '/usr/bin/sbt', source: 'path' as const }
    fromPath.mockResolvedValueOnce(expected)
    expect(await doResolveSbt()).toBe(expected)
  })

  test('returns undefined when PATH misses and download not enabled', async () => {
    const { doResolveSbt, fromPath, fromVfs } = await loadFresh()
    fromVfs.mockResolvedValueOnce(undefined)
    fromPath.mockResolvedValueOnce(undefined)
    expect(await doResolveSbt()).toBeUndefined()
  })

  test('falls through to download when PATH misses + opts.downloadIfMissing', async () => {
    const { doResolveSbt, fromDownload, fromPath, fromVfs } = await loadFresh()
    fromVfs.mockResolvedValueOnce(undefined)
    fromPath.mockResolvedValueOnce(undefined)
    const expected = {
      binaryPath: '/cache/sbt',
      source: 'download' as const,
    }
    fromDownload.mockResolvedValueOnce(expected)
    const opts = { downloadIfMissing: { version: '1.9.0' } }
    expect(await doResolveSbt(opts)).toBe(expected)
    expect(fromDownload).toHaveBeenCalledWith(opts.downloadIfMissing)
  })
})

describe.sequential('external-tools/sbt/resolve — resolveSbt memoization', () => {
  test('memoizes by cacheKey', async () => {
    const { fromPath, fromVfs, resolveSbt } = await loadFresh()
    fromVfs.mockResolvedValue(undefined)
    const expected = { binaryPath: '/usr/bin/sbt', source: 'path' as const }
    fromPath.mockResolvedValueOnce(expected)
    const a = await resolveSbt()
    const b = await resolveSbt()
    expect(a).toBe(expected)
    expect(b).toBe(expected)
    expect(fromPath).toHaveBeenCalledTimes(1)
  })
})
