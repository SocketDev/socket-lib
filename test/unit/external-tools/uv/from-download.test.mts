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
  const mod = await import('../../../../src/external-tools/uv/from-download')
  return { downloadMock, uvFromDownload: mod.uvFromDownload }
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe.sequential('external-tools/uv/from-download', () => {
  test('returns undefined when the platform-arch is not shipped', async () => {
    const { uvFromDownload, downloadMock } = await loadFresh()
    const result = await uvFromDownload({
      platformArch: 'freebsd-x64',
      version: '1.0.0',
    })
    expect(result).toBeUndefined()
    expect(downloadMock).not.toHaveBeenCalled()
  })

  test('downloads + returns Resolved* on supported platform', async () => {
    const { uvFromDownload, downloadMock } = await loadFresh()
    downloadMock.mockResolvedValueOnce({ integrity: 'sha512-fake==' })
    const result = await uvFromDownload({
      platformArch: 'linux-x64',
      version: '1.0.0',
    })
    expect(result?.source).toBe('download')
    expect(result?.integrity).toBe('sha512-fake==')
    expect(result?.path).toContain(path.join('/fake/dlx', 'uv', '1.0.0', 'linux-x64'))
  })

  test('passes a custom cacheDir', async () => {
    const { uvFromDownload, downloadMock } = await loadFresh()
    downloadMock.mockResolvedValueOnce({ integrity: 'sha512-x==' })
    await uvFromDownload({
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
      const { uvFromDownload, downloadMock } = await loadFresh()
      downloadMock.mockResolvedValueOnce({ integrity: 'sha512-x==' })
      const result = await uvFromDownload({
        cacheDir: '/c',
        platformArch: 'linux-x64',
        version: '1.0.0',
      })
      expect(result?.path).toMatch(/uv\.exe$/)
    } finally {
      Object.defineProperty(process, 'platform', original)
    }
  })

  test('passes integrity + downloader through', async () => {
    const { uvFromDownload, downloadMock } = await loadFresh()
    downloadMock.mockResolvedValueOnce({ integrity: 'sha512-x==' })
    const downloader = vi.fn()
    await uvFromDownload({
      cacheDir: '/c',
      downloader,
      integrity: 'sha512-input==',
      platformArch: 'linux-x64',
      version: '1.0.0',
    })
    const callArg = downloadMock.mock.calls[0]![0] as { downloader: unknown; integrity: unknown }
    expect(callArg.downloader).toBe(downloader)
    expect(callArg.integrity).toBe('sha512-input==')
  })
})
