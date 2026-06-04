import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { cacheKey } from '../../../../src/external-tools/python/resolve'

vi.mock(import('../../../../src/external-tools/python/from-path'), () => ({
  pythonFromPath: vi.fn(),
}))

vi.mock(import('../../../../src/external-tools/python/from-download'), () => ({
  pythonFromDownload: vi.fn(),
}))

async function loadFresh() {
  const pathMod =
    await import('../../../../src/external-tools/python/from-path')
  const dlMod =
    await import('../../../../src/external-tools/python/from-download')
  const mod = await import('../../../../src/external-tools/python/resolve')
  return {
    doResolvePython: mod.doResolvePython,
    resolvePython: mod.resolvePython,
    resetPythonResolution: mod.resetPythonResolution,
    pythonFromPathMock: pathMod.pythonFromPath as ReturnType<typeof vi.fn>,
    pythonFromDownloadMock: dlMod.pythonFromDownload as ReturnType<
      typeof vi.fn
    >,
  }
}

const ON_PATH = { path: '/usr/bin/python3', source: 'path' as const }
const DOWNLOADED = {
  path: '/dlx/python/bin/python3',
  source: 'download' as const,
}
const PIN = { tag: '20260203', version: '3.11.14' }

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('external-tools/python/resolve — cacheKey', () => {
  test('returns "local-only" when no opts are given', () => {
    expect(cacheKey(undefined)).toBe('local-only')
  })

  test('returns "local-only" when opts has no downloadIfMissing', () => {
    expect(cacheKey({})).toBe('local-only')
  })

  test('prefixes prefer when preferDownload is set', () => {
    expect(cacheKey({ preferDownload: true })).toBe('prefer:local-only')
  })

  test('returns a download-shaped key', () => {
    expect(
      cacheKey({
        downloadIfMissing: {
          arch: 'linux-x64',
          tag: '20260203',
          version: '3.11.14',
        },
      }),
    ).toBe('dl:3.11.14:20260203:linux-x64::')
  })

  test('encodes a string integrity', () => {
    expect(
      cacheKey({
        downloadIfMissing: {
          arch: 'linux-x64',
          tag: '20260203',
          version: '3.11.14',
          integrity: 'sha256-py',
        },
      }),
    ).toBe('dl:3.11.14:20260203:linux-x64:sha256-py:')
  })

  test('encodes a structured integrity', () => {
    expect(
      cacheKey({
        downloadIfMissing: {
          arch: 'linux-x64',
          tag: '20260203',
          version: '3.11.14',
          integrity: { type: 'checksum', value: 'hex-val' },
        },
      }),
    ).toBe('dl:3.11.14:20260203:linux-x64:checksum:hex-val:')
  })

  test('preferDownload + download key combine', () => {
    expect(
      cacheKey({
        preferDownload: true,
        downloadIfMissing: {
          arch: 'darwin-arm64',
          tag: '20260203',
          version: '3.11.14',
        },
      }),
    ).toBe('prefer:dl:3.11.14:20260203:darwin-arm64::')
  })
})

describe.sequential('external-tools/python/resolve — doResolvePython', () => {
  test('PATH wins by default when present', async () => {
    const { doResolvePython, pythonFromPathMock, pythonFromDownloadMock } =
      await loadFresh()
    pythonFromPathMock.mockResolvedValueOnce(ON_PATH)
    const result = await doResolvePython({ downloadIfMissing: PIN })
    expect(result).toEqual(ON_PATH)
    // Download tier not consulted when PATH hits and preferDownload is off.
    expect(pythonFromDownloadMock).not.toHaveBeenCalled()
  })

  test('preferDownload tries the download tier first', async () => {
    const { doResolvePython, pythonFromPathMock, pythonFromDownloadMock } =
      await loadFresh()
    pythonFromDownloadMock.mockResolvedValueOnce(DOWNLOADED)
    const result = await doResolvePython({
      preferDownload: true,
      downloadIfMissing: PIN,
    })
    expect(result).toEqual(DOWNLOADED)
    expect(pythonFromPathMock).not.toHaveBeenCalled()
  })

  test('falls back to download when PATH misses', async () => {
    const { doResolvePython, pythonFromPathMock, pythonFromDownloadMock } =
      await loadFresh()
    pythonFromPathMock.mockResolvedValueOnce(undefined)
    pythonFromDownloadMock.mockResolvedValueOnce(DOWNLOADED)
    const result = await doResolvePython({ downloadIfMissing: PIN })
    expect(result).toEqual(DOWNLOADED)
  })

  test('preferDownload falls through to PATH when the download tier misses', async () => {
    const { doResolvePython, pythonFromPathMock, pythonFromDownloadMock } =
      await loadFresh()
    pythonFromDownloadMock.mockResolvedValueOnce(undefined)
    pythonFromPathMock.mockResolvedValueOnce(ON_PATH)
    const result = await doResolvePython({
      preferDownload: true,
      downloadIfMissing: PIN,
    })
    expect(result).toEqual(ON_PATH)
  })

  test('returns undefined when PATH misses and no download pin is given', async () => {
    const { doResolvePython, pythonFromPathMock } = await loadFresh()
    pythonFromPathMock.mockResolvedValueOnce(undefined)
    expect(await doResolvePython()).toBeUndefined()
  })
})

describe.sequential('external-tools/python/resolve — resolvePython memoization', () => {
  test('caches the resolution per option-shape (one probe per key)', async () => {
    const { resolvePython, pythonFromPathMock } = await loadFresh()
    pythonFromPathMock.mockResolvedValue(ON_PATH)
    const a = await resolvePython()
    const b = await resolvePython()
    expect(a).toEqual(ON_PATH)
    expect(b).toEqual(ON_PATH)
    // Same key → resolved once.
    expect(pythonFromPathMock).toHaveBeenCalledTimes(1)
  })

  test('resetPythonResolution clears the cache', async () => {
    const { resolvePython, resetPythonResolution, pythonFromPathMock } =
      await loadFresh()
    pythonFromPathMock.mockResolvedValue(ON_PATH)
    await resolvePython()
    resetPythonResolution()
    await resolvePython()
    expect(pythonFromPathMock).toHaveBeenCalledTimes(2)
  })
})
