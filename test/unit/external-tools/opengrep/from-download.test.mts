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
})
