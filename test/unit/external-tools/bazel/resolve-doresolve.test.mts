import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../../../../src/external-tools/bazel/from-path', () => ({
  bazelFromPath: vi.fn(),
}))
vi.mock('../../../../src/external-tools/bazel/from-download', () => ({
  bazelFromDownload: vi.fn(),
}))

async function loadFresh() {
  const pathMod = await import(
    '../../../../src/external-tools/bazel/from-path'
  )
  const dlMod = await import(
    '../../../../src/external-tools/bazel/from-download'
  )
  const mod = await import('../../../../src/external-tools/bazel/resolve')
  return {
    fromPath: pathMod.bazelFromPath as ReturnType<typeof vi.fn>,
    fromDownload: dlMod.bazelFromDownload as ReturnType<typeof vi.fn>,
    cacheKey: mod.cacheKey,
    doResolveBazel: mod.doResolveBazel,
    resolveBazel: mod.resolveBazel,
    resetBazelResolution: mod.resetBazelResolution,
  }
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe.sequential('external-tools/bazel/resolve — cacheKey', () => {
  test('returns "local-only" without downloadIfMissing', async () => {
    const { cacheKey } = await loadFresh()
    expect(cacheKey(undefined)).toBe('local-only')
    expect(cacheKey({})).toBe('local-only')
  })

  test('encodes a string integrity', async () => {
    const { cacheKey } = await loadFresh()
    expect(
      cacheKey({
        downloadIfMissing: {
          version: '7.0.0',
          platformArch: 'darwin-arm64',
          integrity: 'sha256-abc',
        },
      }),
    ).toBe('dl:7.0.0:darwin-arm64:sha256-abc')
  })

  test('encodes a structured integrity', async () => {
    const { cacheKey } = await loadFresh()
    expect(
      cacheKey({
        downloadIfMissing: {
          version: '7.0.0',
          platformArch: 'darwin-arm64',
          integrity: { type: 'checksum', value: 'bazel-csum' },
        },
      }),
    ).toBe('dl:7.0.0:darwin-arm64:checksum:bazel-csum')
  })
})

describe.sequential('external-tools/bazel/resolve — doResolveBazel', () => {
  test('returns PATH result when bazel is on PATH', async () => {
    const { doResolveBazel, fromPath } = await loadFresh()
    const expected = { binaryPath: '/usr/bin/bazel', source: 'path' as const }
    fromPath.mockResolvedValueOnce(expected)
    expect(await doResolveBazel()).toBe(expected)
  })

  test('returns undefined when PATH misses and download not enabled', async () => {
    const { doResolveBazel, fromPath } = await loadFresh()
    fromPath.mockResolvedValueOnce(undefined)
    expect(await doResolveBazel()).toBeUndefined()
  })

  test('falls through to download when PATH misses + opts.downloadIfMissing', async () => {
    const { doResolveBazel, fromDownload, fromPath } = await loadFresh()
    fromPath.mockResolvedValueOnce(undefined)
    const expected = {
      binaryPath: '/cache/bazel',
      source: 'download' as const,
    }
    fromDownload.mockResolvedValueOnce(expected)
    const opts = {
      downloadIfMissing: { version: '7.0.0', platformArch: 'darwin-arm64' },
    }
    expect(await doResolveBazel(opts)).toBe(expected)
    expect(fromDownload).toHaveBeenCalledWith(opts.downloadIfMissing)
  })
})

describe.sequential('external-tools/bazel/resolve — resolveBazel memoization', () => {
  test('memoizes by cacheKey', async () => {
    const { fromPath, resolveBazel } = await loadFresh()
    const expected = { binaryPath: '/usr/bin/bazel', source: 'path' as const }
    fromPath.mockResolvedValueOnce(expected)
    expect(await resolveBazel()).toBe(expected)
    expect(await resolveBazel()).toBe(expected)
    expect(fromPath).toHaveBeenCalledTimes(1)
  })
})
