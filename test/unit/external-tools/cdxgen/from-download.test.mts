import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type nodeFs from 'node:fs'

vi.mock(import('../../../../src/external-tools/from-download'), () => ({
  downloadToolArchive: vi.fn(),
}))

vi.mock(import('../../../../src/paths/socket'), () => ({
  getSocketDlxDir: vi.fn(() => '/fake/dlx'),
}))

vi.mock(import('../../../../src/fs/safe'), () => ({
  safeMkdir: vi.fn(async () => undefined),
}))

vi.mock(import('node:fs'), async () => {
  const actual = await vi.importActual<typeof nodeFs>('node:fs')
  return {
    ...actual,
    promises: {
      ...actual.promises,
      copyFile: vi.fn(async () => undefined),
      chmod: vi.fn(async () => undefined),
    },
  }
})

async function loadFresh() {
  const fdMod = await import('../../../../src/external-tools/from-download')
  const archiveMock = fdMod.downloadToolArchive as ReturnType<typeof vi.fn>
  const mod =
    await import('../../../../src/external-tools/cdxgen/from-download')
  return { archiveMock, cdxgenFromDownload: mod.cdxgenFromDownload }
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe.sequential('external-tools/cdxgen/from-download', () => {
  test('returns undefined when the platform-arch is not shipped', async () => {
    const { cdxgenFromDownload, archiveMock } = await loadFresh()
    const result = await cdxgenFromDownload({
      platformArch: 'freebsd-x64',
      version: '12.4.1',
    })
    expect(result).toBeUndefined()
    expect(archiveMock).not.toHaveBeenCalled()
  })

  test('uses slim variant when not explicitly set', async () => {
    const { cdxgenFromDownload, archiveMock } = await loadFresh()
    archiveMock.mockResolvedValueOnce({
      archivePath: '/tmp/cdxgen-blob',
      integrity: 'sha512-fake==',
    })
    await cdxgenFromDownload({
      cacheDir: '/c',
      platformArch: 'linux-x64',
      version: '12.4.1',
    })
    // Default install dir layout: <dlx>/cdxgen/<version>/<platformArch>-<variant>
    const callArg = archiveMock.mock.calls[0]![0] as {
      name: string
      url: string
    }
    expect(callArg.name).toContain('slim')
    expect(callArg.url).toContain('-slim')
  })

  test('honors explicit full variant', async () => {
    const { cdxgenFromDownload, archiveMock } = await loadFresh()
    archiveMock.mockResolvedValueOnce({
      archivePath: '/tmp/cdxgen-blob',
      integrity: 'sha512-fake==',
    })
    await cdxgenFromDownload({
      cacheDir: '/c',
      platformArch: 'linux-x64',
      variant: 'full',
      version: '12.4.1',
    })
    const callArg = archiveMock.mock.calls[0]![0] as {
      name: string
      url: string
    }
    expect(callArg.name).not.toContain('-slim')
    expect(callArg.url).not.toContain('-slim')
  })

  test('passes integrity + downloader through', async () => {
    const { cdxgenFromDownload, archiveMock } = await loadFresh()
    archiveMock.mockResolvedValueOnce({
      archivePath: '/tmp/cdxgen-blob',
      integrity: 'sha512-fake==',
    })
    const downloader = vi.fn()
    await cdxgenFromDownload({
      cacheDir: '/c',
      downloader,
      integrity: 'sha512-input==',
      platformArch: 'linux-x64',
      version: '12.4.1',
    })
    const callArg = archiveMock.mock.calls[0]![0] as {
      downloader: unknown
      integrity: unknown
    }
    expect(callArg.downloader).toBe(downloader)
    expect(callArg.integrity).toBe('sha512-input==')
  })

  test('falls back to socket dlx dir when cacheDir is omitted', async () => {
    const { cdxgenFromDownload, archiveMock } = await loadFresh()
    archiveMock.mockResolvedValueOnce({
      archivePath: '/tmp/cdxgen-blob',
      integrity: 'sha512-fake==',
    })
    const result = await cdxgenFromDownload({
      platformArch: 'linux-x64',
      version: '12.4.1',
    })
    // Normalize to forward slashes so the regex matches across darwin /
    // linux / win32. `path.join` on win32 produces backslashes for ALL
    // separators (including ones in the input), so a literal `/fake/dlx`
    // prefix would become `\fake\dlx` on Windows.
    const normalized = result?.path.replace(/\\/g, '/')
    expect(normalized).toMatch(/\/fake\/dlx\/cdxgen\/12\.4\.1\/linux-x64-slim/)
  })

  test('appends .exe suffix on win32', async () => {
    const { cdxgenFromDownload, archiveMock } = await loadFresh()
    archiveMock.mockResolvedValueOnce({
      archivePath: '/tmp/cdxgen-blob',
      integrity: 'sha512-fake==',
    })
    const original = Object.getOwnPropertyDescriptor(process, 'platform')!
    Object.defineProperty(process, 'platform', { value: 'win32' })
    try {
      const result = await cdxgenFromDownload({
        cacheDir: '/c',
        platformArch: 'linux-x64',
        version: '12.4.1',
      })
      expect(result?.path).toMatch(/cdxgen\.exe$/)
    } finally {
      Object.defineProperty(process, 'platform', original)
    }
  })
})
