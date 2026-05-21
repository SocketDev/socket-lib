import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../../../../src/external-tools/from-download', () => ({
  downloadAndExtractTool: vi.fn(),
  downloadToolArchive: vi.fn(),
}))

vi.mock('../../../../src/paths/socket', () => ({
  getSocketDlxDir: vi.fn(() => '/fake/dlx'),
}))

async function loadFresh() {
  const fdMod = await import('../../../../src/external-tools/from-download')
  const downloadMock = fdMod.downloadAndExtractTool as ReturnType<typeof vi.fn>
  const archiveMock = fdMod.downloadToolArchive as ReturnType<typeof vi.fn>
  const mod =
    await import('../../../../src/external-tools/opengrep/from-download')
  return {
    downloadMock,
    archiveMock,
    opengrepFromDownload: mod.opengrepFromDownload,
  }
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe.sequential('external-tools/opengrep/from-download', () => {
  test('returns undefined when the platform-arch is not shipped', async () => {
    const { opengrepFromDownload, downloadMock, archiveMock } =
      await loadFresh()
    const result = await opengrepFromDownload({
      platformArch: 'freebsd-x64',
      version: '1.16.5',
    })
    expect(result).toBeUndefined()
    expect(downloadMock).not.toHaveBeenCalled()
    expect(archiveMock).not.toHaveBeenCalled()
  })

  test('windows uses downloadAndExtractTool (isArchive=true path)', async () => {
    const { opengrepFromDownload, downloadMock, archiveMock } =
      await loadFresh()
    downloadMock.mockResolvedValueOnce({ integrity: 'sha512-win==' })
    const result = await opengrepFromDownload({
      cacheDir: '/c',
      platformArch: 'win-x64',
      version: '1.16.5',
    })
    expect(downloadMock).toHaveBeenCalledTimes(1)
    expect(archiveMock).not.toHaveBeenCalled()
    expect(result?.source).toBe('download')
    expect(result?.integrity).toBe('sha512-win==')
    // Win asset includes the in-archive opengrep-core.exe binary.
    expect(result?.path).toMatch(/opengrep-core\.exe$/)
  })

  test('passes integrity + downloader through to the archive path', async () => {
    const { opengrepFromDownload, downloadMock } = await loadFresh()
    downloadMock.mockResolvedValueOnce({ integrity: 'sha512-out==' })
    const downloader = vi.fn()
    await opengrepFromDownload({
      cacheDir: '/c',
      downloader,
      integrity: 'sha512-input==',
      platformArch: 'win-x64',
      version: '1.16.5',
    })
    const callArg = downloadMock.mock.calls[0]![0] as {
      downloader: unknown
      integrity: unknown
    }
    expect(callArg.downloader).toBe(downloader)
    expect(callArg.integrity).toBe('sha512-input==')
  })

  test('linux uses downloadToolArchive + chmod (bare-binary path)', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs')
    const { statSync, readFileSync, writeFileSync } = await import('node:fs')
    const os = await import('node:os')
    const path = await import('node:path')
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'og-download-test-'))
    try {
      // Pre-create the archive file the source will copy from.
      const archivePath = path.join(tmp, 'archive-bin')
      writeFileSync(archivePath, '#!/bin/sh\n')
      const { archiveMock, downloadMock, opengrepFromDownload } =
        await loadFresh()
      archiveMock.mockResolvedValueOnce({
        archivePath,
        integrity: 'sha512-bare==',
      })
      const result = await opengrepFromDownload({
        cacheDir: tmp,
        platformArch: 'linux-x64',
        version: '1.16.5',
      })
      expect(downloadMock).not.toHaveBeenCalled()
      expect(archiveMock).toHaveBeenCalledTimes(1)
      expect(result?.source).toBe('download')
      expect(result?.integrity).toBe('sha512-bare==')
      const finalPath = path.join(tmp, 'opengrep')
      expect(result?.path).toBe(finalPath)
      expect(readFileSync(finalPath, 'utf8')).toBe('#!/bin/sh\n')
      if (os.platform() !== 'win32') {
        expect(statSync(finalPath).mode & 0o777).toBe(0o755)
      }
    } finally {
      rmSync(tmp, { force: true, recursive: true })
    }
  })

  test('macos uses downloadToolArchive + chmod (bare-binary path)', async () => {
    const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs')
    const os = await import('node:os')
    const path = await import('node:path')
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'og-download-test-'))
    try {
      const archivePath = path.join(tmp, 'mac-bin')
      writeFileSync(archivePath, 'binary')
      const { archiveMock, opengrepFromDownload } = await loadFresh()
      archiveMock.mockResolvedValueOnce({
        archivePath,
        integrity: 'sha512-mac==',
      })
      const result = await opengrepFromDownload({
        cacheDir: tmp,
        platformArch: 'darwin-arm64',
        version: '1.16.5',
      })
      expect(result?.source).toBe('download')
      expect(result?.path).toBe(path.join(tmp, 'opengrep'))
    } finally {
      rmSync(tmp, { force: true, recursive: true })
    }
  })

  test('uses default cacheDir under getSocketDlxDir() when none provided', async () => {
    const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs')
    const os = await import('node:os')
    const path = await import('node:path')
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'og-default-cache-test-'))
    try {
      // Re-mock getSocketDlxDir to point at our tmpdir so the default
      // cacheDir branch is exercised against a writable path.
      vi.resetModules()
      vi.doMock('../../../../src/paths/socket', () => ({
        getSocketDlxDir: vi.fn(() => tmp),
      }))
      vi.doMock('../../../../src/external-tools/from-download', () => ({
        downloadAndExtractTool: vi.fn(),
        downloadToolArchive: vi.fn(),
      }))
      const archivePath = path.join(tmp, 'bare-bin')
      writeFileSync(archivePath, 'x')
      const fdMod = await import('../../../../src/external-tools/from-download')
      const archiveMock = fdMod.downloadToolArchive as ReturnType<typeof vi.fn>
      archiveMock.mockResolvedValueOnce({
        archivePath,
        integrity: 'sha512-def==',
      })
      const mod =
        await import('../../../../src/external-tools/opengrep/from-download')
      const result = await mod.opengrepFromDownload({
        platformArch: 'linux-x64',
        version: '1.16.5',
      })
      expect(result?.path).toBe(
        path.join(tmp, 'opengrep', '1.16.5', 'linux-x64', 'opengrep'),
      )
    } finally {
      rmSync(tmp, { force: true, recursive: true })
      vi.resetModules()
    }
  })
})
