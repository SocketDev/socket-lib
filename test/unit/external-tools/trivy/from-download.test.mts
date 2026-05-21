import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../../../../src/external-tools/from-download', () => ({
  downloadAndExtractTool: vi.fn(),
}))

vi.mock('../../../../src/paths/socket', () => ({
  getSocketDlxDir: vi.fn(() => '/fake/dlx'),
}))

async function loadFresh() {
  const fdMod = await import('../../../../src/external-tools/from-download')
  const downloadMock = fdMod.downloadAndExtractTool as ReturnType<typeof vi.fn>
  const mod = await import('../../../../src/external-tools/trivy/from-download')
  return { downloadMock, trivyFromDownload: mod.trivyFromDownload }
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe.sequential('external-tools/trivy/from-download', () => {
  test('returns undefined when the platform-arch is not shipped', async () => {
    const { trivyFromDownload, downloadMock } = await loadFresh()
    const result = await trivyFromDownload({
      platformArch: 'win-arm64',
      version: '1.0.0',
    })
    expect(result).toBeUndefined()
    expect(downloadMock).not.toHaveBeenCalled()
  })

  test('downloads + returns Resolved* on supported platform', async () => {
    const { trivyFromDownload, downloadMock } = await loadFresh()
    downloadMock.mockResolvedValueOnce({ integrity: 'sha512-fake==' })
    const result = await trivyFromDownload({
      platformArch: 'linux-x64',
      version: '1.0.0',
    })
    expect(result?.source).toBe('download')
    expect(result?.integrity).toBe('sha512-fake==')
    expect(result?.path).toContain(
      path.join('/fake/dlx', 'trivy', '1.0.0', 'linux-x64'),
    )
  })

  test('passes a custom cacheDir', async () => {
    const { trivyFromDownload, downloadMock } = await loadFresh()
    downloadMock.mockResolvedValueOnce({ integrity: 'sha512-x==' })
    await trivyFromDownload({
      cacheDir: '/custom/cache',
      platformArch: 'linux-x64',
      version: '1.0.0',
    })
    const callArg = downloadMock.mock.calls[0]![0] as { extractedDir: string }
    expect(callArg.extractedDir).toBe('/custom/cache')
  })

  test('returned path uses .exe on win32', async () => {
    const original = Object.getOwnPropertyDescriptor(process, 'platform')!
    Object.defineProperty(process, 'platform', { value: 'win32' })
    try {
      const { trivyFromDownload, downloadMock } = await loadFresh()
      downloadMock.mockResolvedValueOnce({ integrity: 'sha512-x==' })
      const result = await trivyFromDownload({
        cacheDir: '/c',
        platformArch: 'linux-x64',
        version: '1.0.0',
      })
      expect(result?.path).toMatch(/trivy\.exe$/)
    } finally {
      Object.defineProperty(process, 'platform', original)
    }
  })

  test('passes integrity + downloader through', async () => {
    const { trivyFromDownload, downloadMock } = await loadFresh()
    downloadMock.mockResolvedValueOnce({ integrity: 'sha512-x==' })
    const downloader = vi.fn()
    await trivyFromDownload({
      cacheDir: '/c',
      downloader,
      integrity: 'sha512-input==',
      platformArch: 'linux-x64',
      version: '1.0.0',
    })
    const callArg = downloadMock.mock.calls[0]![0] as {
      downloader: unknown
      integrity: unknown
    }
    expect(callArg.downloader).toBe(downloader)
    expect(callArg.integrity).toBe('sha512-input==')
  })
})
