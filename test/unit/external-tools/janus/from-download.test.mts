import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../../../../src/external-tools/from-download', () => ({
  downloadAndExtractTool: vi.fn(),
}))

vi.mock('../../../../src/paths/socket', () => ({
  getSocketWheelhouseDir: vi.fn(() => '/fake/wheelhouse'),
}))

async function loadFresh() {
  const fdMod = await import('../../../../src/external-tools/from-download')
  const downloadMock = fdMod.downloadAndExtractTool as ReturnType<typeof vi.fn>
  const mod = await import('../../../../src/external-tools/janus/from-download')
  return { downloadMock, janusFromDownload: mod.janusFromDownload }
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe.sequential('external-tools/janus/from-download', () => {
  test('throws when platformArch is not in the supported set (linux)', async () => {
    const { janusFromDownload, downloadMock } = await loadFresh()
    await expect(
      janusFromDownload({ platformArch: 'linux-x64', version: '1.22.0' }),
    ).rejects.toThrow(/got `linux-x64`/)
    expect(downloadMock).not.toHaveBeenCalled()
  })

  test('throws when platformArch is not in the supported set (win32)', async () => {
    const { janusFromDownload, downloadMock } = await loadFresh()
    await expect(
      janusFromDownload({ platformArch: 'win32-x64', version: '1.22.0' }),
    ).rejects.toThrow(/Upstream janus only publishes the macOS arm64 build/)
    expect(downloadMock).not.toHaveBeenCalled()
  })

  test('throws when platformArch is darwin-x64 (no Intel Mac build)', async () => {
    const { janusFromDownload, downloadMock } = await loadFresh()
    await expect(
      janusFromDownload({ platformArch: 'darwin-x64', version: '1.22.0' }),
    ).rejects.toThrow(/got `darwin-x64`/)
    expect(downloadMock).not.toHaveBeenCalled()
  })

  test('downloads to default wheelhouse dir + returns ResolvedJanus on supported platform', async () => {
    const { janusFromDownload, downloadMock } = await loadFresh()
    downloadMock.mockResolvedValueOnce({ integrity: 'sha512-fake==' })
    const result = await janusFromDownload({
      platformArch: 'darwin-arm64',
      version: '1.22.0',
    })
    expect(result.source).toBe('download')
    expect(result.integrity).toBe('sha512-fake==')
    // Default install dir layout: <wheelhouse>/janus/<version>/<platform-arch>/<binary>
    expect(result.path).toContain(
      path.join('/fake/wheelhouse', 'janus', '1.22.0', 'darwin-arm64'),
    )
  })

  test('returned binary name is bare `janus` (janus has no win32 build, so no .exe branch)', async () => {
    const { janusFromDownload, downloadMock } = await loadFresh()
    downloadMock.mockResolvedValueOnce({ integrity: 'sha512-x==' })
    const result = await janusFromDownload({
      cacheDir: '/c',
      platformArch: 'darwin-arm64',
      version: '1.22.0',
    })
    expect(result.path.endsWith('janus')).toBe(true)
    expect(result.path.endsWith('.exe')).toBe(false)
  })

  test('passes a custom cacheDir to downloadAndExtractTool when provided', async () => {
    const { janusFromDownload, downloadMock } = await loadFresh()
    downloadMock.mockResolvedValueOnce({ integrity: 'sha512-x==' })
    await janusFromDownload({
      cacheDir: '/custom/cache',
      platformArch: 'darwin-arm64',
      version: '1.22.0',
    })
    expect(downloadMock).toHaveBeenCalledTimes(1)
    const callArg = downloadMock.mock.calls[0]![0] as { extractedDir: string }
    expect(callArg.extractedDir).toBe('/custom/cache')
  })

  test('passes integrity through to downloadAndExtractTool', async () => {
    const { janusFromDownload, downloadMock } = await loadFresh()
    downloadMock.mockResolvedValueOnce({ integrity: 'sha512-x==' })
    await janusFromDownload({
      cacheDir: '/c',
      integrity: 'sha512-input==',
      platformArch: 'darwin-arm64',
      version: '1.22.0',
    })
    const callArg = downloadMock.mock.calls[0]![0] as { integrity: unknown }
    expect(callArg.integrity).toBe('sha512-input==')
  })

  test('passes a custom downloader through to downloadAndExtractTool', async () => {
    const { janusFromDownload, downloadMock } = await loadFresh()
    downloadMock.mockResolvedValueOnce({ integrity: 'sha512-x==' })
    const downloader = vi.fn()
    await janusFromDownload({
      cacheDir: '/c',
      downloader,
      platformArch: 'darwin-arm64',
      version: '1.22.0',
    })
    const callArg = downloadMock.mock.calls[0]![0] as { downloader: unknown }
    expect(callArg.downloader).toBe(downloader)
  })
})
