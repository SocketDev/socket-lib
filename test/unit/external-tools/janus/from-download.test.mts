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
  test('returns undefined when the platform-arch is not shipped', async () => {
    const { janusFromDownload, downloadMock } = await loadFresh()
    const result = await janusFromDownload({
      platformArch: 'linux-x64',
      version: '1.22.0',
    })
    expect(result).toBeUndefined()
    expect(downloadMock).not.toHaveBeenCalled()
  })

  test('downloads to default wheelhouse dir + returns ResolvedJanus on supported platform', async () => {
    const { janusFromDownload, downloadMock } = await loadFresh()
    downloadMock.mockResolvedValueOnce({ integrity: 'sha512-fake==' })
    const result = await janusFromDownload({
      platformArch: 'darwin-arm64',
      version: '1.22.0',
    })
    expect(result?.source).toBe('download')
    expect(result?.integrity).toBe('sha512-fake==')
    // Default install dir layout: <wheelhouse>/janus/<version>/<platform-arch>/<binary>
    expect(result?.path).toContain(
      path.join('/fake/wheelhouse', 'janus', '1.22.0', 'darwin-arm64'),
    )
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

  test('returned path uses .exe suffix on win32', async () => {
    const original = Object.getOwnPropertyDescriptor(process, 'platform')!
    Object.defineProperty(process, 'platform', { value: 'win32' })
    try {
      const { janusFromDownload, downloadMock } = await loadFresh()
      downloadMock.mockResolvedValueOnce({ integrity: 'sha512-x==' })
      const result = await janusFromDownload({
        cacheDir: '/c',
        platformArch: 'darwin-arm64',
        version: '1.22.0',
      })
      expect(result?.path).toMatch(/janus\.exe$/)
    } finally {
      Object.defineProperty(process, 'platform', original)
    }
  })

  test('returned path has no .exe suffix on non-win32', async () => {
    const { janusFromDownload, downloadMock } = await loadFresh()
    downloadMock.mockResolvedValueOnce({ integrity: 'sha512-x==' })
    const result = await janusFromDownload({
      cacheDir: '/c',
      platformArch: 'darwin-arm64',
      version: '1.22.0',
    })
    // Non-win32 hosts get the bare binary name; the .exe variant is host-conditional.
    expect(result?.path.endsWith('janus')).toBe(true)
    expect(result?.path.endsWith('.exe')).toBe(false)
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
