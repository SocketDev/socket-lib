import path from 'node:path'
import process from 'node:process'

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { normalizePath } from '@socketsecurity/lib/paths/normalize'

import {
  pythonBinPath,
  pythonCacheDir,
} from '../../../../src/external-tools/python/from-download'

vi.mock(import('../../../../src/external-tools/from-download'), () => ({
  downloadAndExtractTool: vi.fn(),
}))

async function loadFresh() {
  const fromDlMod = await import('../../../../src/external-tools/from-download')
  const mod =
    await import('../../../../src/external-tools/python/from-download')
  return {
    downloadAndExtractToolMock: fromDlMod.downloadAndExtractTool as ReturnType<
      typeof vi.fn
    >,
    pythonFromDownload: mod.pythonFromDownload,
  }
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('external-tools/python/from-download — path helpers', () => {
  const WIN32 = process.platform === 'win32'

  test('pythonBinPath nests under python/ with the per-OS interpreter', () => {
    const dir = path.join('a', 'b')
    const expected = WIN32
      ? path.join(dir, 'python', 'python.exe')
      : path.join(dir, 'python', 'bin', 'python3')
    expect(pythonBinPath(dir)).toBe(expected)
  })

  test('pythonBinPath follows the TARGET arch, not the host', () => {
    const dir = path.join('a', 'b')
    // A win-* target always yields python.exe; any other target bin/python3 —
    // independent of the host the resolution runs on (cross-compile-safe).
    expect(normalizePath(pythonBinPath(dir, 'win-x64'))).toBe(
      'a/b/python/python.exe',
    )
    expect(normalizePath(pythonBinPath(dir, 'linux-x64'))).toBe(
      'a/b/python/bin/python3',
    )
    expect(normalizePath(pythonBinPath(dir, 'darwin-arm64'))).toBe(
      'a/b/python/bin/python3',
    )
  })

  test('pythonCacheDir encodes version-tag-arch under _dlx/python', () => {
    const dir = pythonCacheDir('3.11.14', '20260203', 'darwin-arm64')
    expect(normalizePath(dir)).toContain(
      '/_dlx/python/3.11.14-20260203-darwin-arm64',
    )
  })
})

describe.sequential('external-tools/python/from-download — pythonFromDownload', () => {
  test('downloads + extracts, returning the interpreter path and integrity', async () => {
    const { downloadAndExtractToolMock, pythonFromDownload } = await loadFresh()
    downloadAndExtractToolMock.mockResolvedValueOnce({
      integrity: 'sha512-deadbeef',
    })
    const result = await pythonFromDownload({
      arch: 'darwin-arm64',
      tag: '20260203',
      version: '3.11.14',
    })
    expect(result!.source).toBe('download')
    expect(result!.integrity).toBe('sha512-deadbeef')
    // path points inside the default cache dir, at the per-OS interpreter.
    expect(normalizePath(result!.path)).toContain(
      '/_dlx/python/3.11.14-20260203-darwin-arm64/python/',
    )
    // The download was pointed at the upstream asset URL with the matching name.
    const arg = downloadAndExtractToolMock.mock.calls[0]![0]
    expect(arg.url).toContain('python-build-standalone')
    expect(arg.name).toBe('python-3.11.14-20260203-darwin-arm64.tar.gz')
  })

  test('honors a cacheDir override for the extraction dir', async () => {
    const { downloadAndExtractToolMock, pythonFromDownload } = await loadFresh()
    downloadAndExtractToolMock.mockResolvedValueOnce({ integrity: 'sha512-x' })
    const result = await pythonFromDownload({
      arch: 'linux-x64',
      cacheDir: '/custom/py',
      tag: '20260203',
      version: '3.11.14',
    })
    // The interpreter layout follows the TARGET arch (linux-x64 here), not the
    // host — so it's always python/bin/python3 regardless of where the test runs.
    expect(normalizePath(result!.path)).toBe('/custom/py/python/bin/python3')
    expect(downloadAndExtractToolMock.mock.calls[0]![0].extractedDir).toBe(
      '/custom/py',
    )
  })

  test('returns undefined for an unsupported arch (no download attempted)', async () => {
    const { downloadAndExtractToolMock, pythonFromDownload } = await loadFresh()
    const result = await pythonFromDownload({
      arch: 'sunos-sparc',
      tag: '20260203',
      version: '3.11.14',
    })
    expect(result).toBeUndefined()
    expect(downloadAndExtractToolMock).not.toHaveBeenCalled()
  })
})
