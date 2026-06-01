import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock(import('../../../../src/external-tools/from-download'), () => ({
  downloadAndExtractTool: vi.fn(),
}))

vi.mock(import('../../../../src/paths/socket'), () => ({
  getSocketDlxDir: vi.fn(() => '/fake/dlx'),
}))

async function loadFresh() {
  const fdMod = await import('../../../../src/external-tools/from-download')
  const downloadMock = fdMod.downloadAndExtractTool as ReturnType<typeof vi.fn>
  const mod =
    await import('../../../../src/external-tools/trufflehog/from-download')
  return { downloadMock, trufflehogFromDownload: mod.trufflehogFromDownload }
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe.sequential('external-tools/trufflehog/from-download', () => {
  test('returns undefined when the platform-arch is not shipped', async () => {
    const { trufflehogFromDownload, downloadMock } = await loadFresh()
    const result = await trufflehogFromDownload({
      platformArch: 'linux-arm64-musl',
      version: '1.0.0',
    })
    expect(result).toBeUndefined()
    expect(downloadMock).not.toHaveBeenCalled()
  })

  test('downloads + returns Resolved* on supported platform', async () => {
    const { trufflehogFromDownload, downloadMock } = await loadFresh()
    downloadMock.mockResolvedValueOnce({ integrity: 'sha512-fake==' })
    const result = await trufflehogFromDownload({
      platformArch: 'linux-x64',
      version: '1.0.0',
    })
    expect(result?.source).toBe('download')
    expect(result?.integrity).toBe('sha512-fake==')
    expect(result?.path).toContain(
      path.join('/fake/dlx', 'trufflehog', '1.0.0', 'linux-x64'),
    )
  })

  test('passes a custom cacheDir', async () => {
    const { trufflehogFromDownload, downloadMock } = await loadFresh()
    downloadMock.mockResolvedValueOnce({ integrity: 'sha512-x==' })
    await trufflehogFromDownload({
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
      const { trufflehogFromDownload, downloadMock } = await loadFresh()
      downloadMock.mockResolvedValueOnce({ integrity: 'sha512-x==' })
      const result = await trufflehogFromDownload({
        cacheDir: '/c',
        platformArch: 'linux-x64',
        version: '1.0.0',
      })
      expect(result?.path).toMatch(/trufflehog\.exe$/)
    } finally {
      Object.defineProperty(process, 'platform', original)
    }
  })

  test('passes integrity + downloader through', async () => {
    const { trufflehogFromDownload, downloadMock } = await loadFresh()
    downloadMock.mockResolvedValueOnce({ integrity: 'sha512-x==' })
    const downloader = vi.fn()
    await trufflehogFromDownload({
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
