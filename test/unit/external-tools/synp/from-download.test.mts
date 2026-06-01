import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock(import('../../../../src/dlx/package'), () => ({
  downloadPackage: vi.fn(),
}))

async function loadFresh() {
  const dlxMod = await import('../../../../src/dlx/package')
  const downloadMock = dlxMod.downloadPackage as ReturnType<typeof vi.fn>
  const mod = await import('../../../../src/external-tools/synp/from-download')
  return { downloadMock, synpFromDownload: mod.synpFromDownload }
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe.sequential('external-tools/synp/from-download', () => {
  test('returns a Resolved* with the resolved bin path', async () => {
    const { synpFromDownload, downloadMock } = await loadFresh()
    downloadMock.mockResolvedValueOnce({ binaryPath: '/dlx/synp/bin/synp' })
    const result = await synpFromDownload({ version: '1.9.14' })
    expect(result).toEqual({
      path: '/dlx/synp/bin/synp',
      source: 'download',
    })
  })

  test('passes the synp package spec to downloadPackage', async () => {
    const { synpFromDownload, downloadMock } = await loadFresh()
    downloadMock.mockResolvedValueOnce({ binaryPath: '/dlx/synp' })
    await synpFromDownload({ version: '1.9.14' })
    const callArg = downloadMock.mock.calls[0]![0] as {
      package: string
      binaryName: string
    }
    expect(callArg.package).toBe('synp@1.9.14')
    expect(callArg.binaryName).toBe('synp')
  })

  test('forwards integrity to dlx as hash when provided', async () => {
    const { synpFromDownload, downloadMock } = await loadFresh()
    downloadMock.mockResolvedValueOnce({ binaryPath: '/dlx/synp' })
    await synpFromDownload({ integrity: 'sha512-input==', version: '1.9.14' })
    const callArg = downloadMock.mock.calls[0]![0] as { hash: unknown }
    expect(callArg.hash).toBe('sha512-input==')
  })

  test('omits hash when integrity is not provided', async () => {
    const { synpFromDownload, downloadMock } = await loadFresh()
    downloadMock.mockResolvedValueOnce({ binaryPath: '/dlx/synp' })
    await synpFromDownload({ version: '1.9.14' })
    const callArg = downloadMock.mock.calls[0]![0] as {
      hash?: unknown | undefined
    }
    expect('hash' in callArg).toBe(false)
  })
})
